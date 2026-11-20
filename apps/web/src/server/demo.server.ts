// Try Struo without an account (spec 042). A few copies of the demo company are prepared in advance;
// a visitor receives one for 24 hours, alone, and moves between the roles (manager, engineer, site
// lead, accountant, client) without typing anything. Nothing leaves a demo company (no e-mail, no
// WhatsApp), its assistant has a tiny budget, and the copy is deleted with its accounts at expiry.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { DomainError } from '@struo/core';
import { DEMO_NAME, seedDemoCompany } from '../../scripts/demo-company.ts';
import { reportError } from './monitor.server.ts';
import type { Runtime } from './runtime.server.ts';

export const DEMO_ROLES = ['owner', 'engineer', 'site_lead', 'accountant', 'client'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
const LOCK = 727102;
const TTL_HOURS = 24;
const PER_VISITOR_PER_DAY = 3;
/** The assistant's budget in a demo copy, in US cents: a few questions, no more. */
const AI_BUDGET_CENTS = 30;

interface Account { key: string; role: string; email: string; id: string }
interface SandboxRow { org_id: string; accounts: Account[]; password_enc: string; portal_token: string | null; expires_at: string | null }

/** Where the demo photos live: next to the server in the image, in the repository in development. */
function assetsDir(): string | null {
  const candidates = [process.env.DEMO_ASSETS_DIR, path.resolve('demo-assets'), path.resolve('apps/web/scripts/demo'), path.resolve('scripts/demo'), path.resolve('../scripts/demo')];
  return candidates.find((candidate): candidate is string => Boolean(candidate) && existsSync(path.join(candidate!, 'photos'))) ?? null;
}

export function demoAvailable(rt: Runtime): boolean {
  return rt.env.DEMO_ENABLED && assetsDir() !== null;
}

async function createSandbox(rt: Runtime): Promise<void> {
  const dir = assetsDir();
  if (!dir) throw new DomainError('demo_unavailable', 409);
  const tag = randomUUID().slice(0, 8);
  const password = `demo-${randomBytes(18).toString('base64url')}`;
  const result = await seedDemoCompany(
    { owner: rt.owner, app: rt.db, storage: rt.storage, assetsDir: dir, passwordHash: await hashPassword(password), baseUrl: rt.env.APP_BASE_URL },
    { name: DEMO_NAME, email: (key) => `${key}.${tag}@demo.struo.test`, replaceExisting: false },
  );
  await rt.owner.query('update org_settings set is_demo = true, ai_policy = $2, ai_budget_cents = $3 where org_id = $1', [result.orgId, 'company', AI_BUDGET_CENTS]);
  const accounts: Account[] = result.users.map((user) => ({ key: user.key, role: user.role, email: user.email, id: user.id }));
  const portal = result.portals.find((item) => !item.requireCode)?.token ?? null;
  await rt.owner.query('insert into demo_sandbox (org_id, accounts, password_enc, portal_token) values ($1, $2, $3, $4)',
    [result.orgId, JSON.stringify(accounts), rt.secrets.seal(password), portal]);
}

async function deleteSandbox(rt: Runtime, row: Pick<SandboxRow, 'org_id' | 'accounts'>): Promise<void> {
  await rt.owner.query('delete from organization where id = $1', [row.org_id]);
  await rt.owner.query('delete from "user" where id = any($1)', [row.accounts.map((account) => account.id)]);
}

/** Deletes expired copies and prepares new ones up to the pool size. One instance at a time. */
export async function refillDemoPool(rt: Runtime): Promise<void> {
  if (!demoAvailable(rt)) return;
  const client = await rt.owner.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [LOCK]);
    if (!rows[0]?.locked) return;
    try {
      const expired = await rt.owner.query<SandboxRow>(`select org_id, accounts from demo_sandbox where status = 'assigned' and expires_at < now()`);
      for (const row of expired.rows) await deleteSandbox(rt, row).catch((error: unknown) => reportError(error, { where: 'demo:delete', orgId: row.org_id }));
      const ready = await rt.owner.query<{ n: number }>(`select count(*)::int as n from demo_sandbox where status = 'ready'`);
      for (let n = ready.rows[0]!.n; n < rt.env.DEMO_POOL; n += 1) await createSandbox(rt);
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK]);
    }
  } finally {
    client.release();
  }
}

const visitorHash = (rt: Runtime, visitor: string) => createHash('sha256').update(`demo:${rt.env.BETTER_AUTH_SECRET}:${visitor}`).digest('hex');

/** Gives a visitor their own copy (prepared in advance, or made now when none is ready). */
export async function claimSandbox(rt: Runtime, visitor: string): Promise<SandboxRow> {
  if (!demoAvailable(rt)) throw new DomainError('demo_unavailable', 409);
  const hash = visitorHash(rt, visitor);
  const recent = await rt.owner.query<{ n: number }>(`select count(*)::int as n from demo_sandbox where visitor_hash = $1 and assigned_at > now() - interval '1 day'`, [hash]);
  if (recent.rows[0]!.n >= PER_VISITOR_PER_DAY) throw new DomainError('demo_limit', 409);
  const claim = () => rt.owner.query<SandboxRow>(
    `update demo_sandbox set status = 'assigned', visitor_hash = $1, assigned_at = now(), expires_at = now() + make_interval(hours => $2)
      where org_id = (select org_id from demo_sandbox where status = 'ready' order by created_at limit 1 for update skip locked)
      returning org_id, accounts, password_enc, portal_token, expires_at`, [hash, TTL_HOURS]);
  let claimed = (await claim()).rows[0];
  if (!claimed) {
    await createSandbox(rt);
    claimed = (await claim()).rows[0];
  }
  // Prepare the next visitor's copy without making this one wait.
  void refillDemoPool(rt).catch((error: unknown) => reportError(error, { where: 'demo:refill' }));
  if (!claimed) throw new DomainError('demo_unavailable', 409);
  return claimed;
}

/** The copy a signed-in demo account belongs to, if any. */
export async function sandboxOfUser(rt: Runtime, userId: string): Promise<SandboxRow | null> {
  const { rows } = await rt.owner.query<SandboxRow>(
    `select d.org_id, d.accounts, d.password_enc, d.portal_token, d.expires_at from demo_sandbox d
      join member m on m."organizationId" = d.org_id where m."userId" = $1 and d.status = 'assigned' and d.expires_at > now() limit 1`, [userId]);
  return rows[0] ?? null;
}

/** The account of a role in a copy (the first site lead, the first engineer…). */
export function accountFor(sandbox: SandboxRow, role: Exclude<DemoRole, 'client'>): Account {
  const preferred = { owner: 'afi', engineer: 'jean', site_lead: 'komi', accountant: 'akossiwa' }[role];
  return sandbox.accounts.find((account) => account.key === preferred) ?? sandbox.accounts.find((account) => account.role === role)!;
}

/** Whether a company may send e-mails or WhatsApp messages (demo companies never do). */
export async function outboundAllowed(rt: Runtime, orgId: string): Promise<boolean> {
  const { rows } = await rt.owner.query<{ demo: boolean }>('select is_demo as demo from org_settings where org_id = $1', [orgId]);
  return !rows[0]?.demo;
}
