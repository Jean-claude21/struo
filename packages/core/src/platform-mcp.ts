import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parse } from './access.ts';
import type { Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { founderMoney, founderTodo, onboardingSteps, PLAN_FEATURES, platformRuns } from './founder.ts';
import { productHealth } from './saas.ts';

/**
 * Spec 056: the founder's console through MCP. A platform key (only its hash kept, read-only or not)
 * lets an assistant or a scheduled routine reach the console's figures and gestures for the admin
 * who created it. Features can be granted to one company outside its plan, until a date.
 * Platform connection only.
 */

const KEY_PREFIX = 'struo_pk_';
const hash = (key: string) => createHash('sha256').update(key).digest('hex');

async function journal(owner: Db, adminId: string, command: string, target: string | null, detail: unknown, door = 'console'): Promise<void> {
  await owner.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)',
    [adminId, command, target, JSON.stringify({ ...(detail && typeof detail === 'object' ? detail : { value: detail ?? null }), door })]);
}

// ---------------------------------------------------------------- platform keys

export async function createPlatformKey(owner: Db, adminId: string, input: unknown): Promise<{ id: string; key: string }> {
  const data = parse(z.object({ name: z.string().trim().min(1).max(80), readOnly: z.boolean().default(true) }), input);
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  const { rows } = await owner.query<{ id: string }>(
    'insert into platform_api_key (name, key_hash, masked, read_only, created_by) values ($1, $2, $3, $4, $5) returning id',
    [data.name, hash(key), `${key.slice(0, 13)}…${key.slice(-4)}`, data.readOnly, adminId]);
  await journal(owner, adminId, 'platform_key.create', rows[0]!.id, { name: data.name, readOnly: data.readOnly });
  return { id: rows[0]!.id, key };
}

export async function listPlatformKeys(owner: Db) {
  const { rows } = await owner.query<{ id: string; name: string; masked: string; readOnly: boolean; createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }>(
    `select k.id, k.name, k.masked, k.read_only as "readOnly", u.email as "createdBy",
            to_char(k.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            to_char(k.last_used_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastUsedAt",
            to_char(k.revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "revokedAt"
       from platform_api_key k left join "user" u on u.id = k.created_by order by k.revoked_at nulls first, k.created_at desc`);
  return rows;
}

export async function revokePlatformKey(owner: Db, adminId: string, id: string): Promise<void> {
  await owner.query('update platform_api_key set revoked_at = now() where id = $1 and revoked_at is null', [id]);
  await journal(owner, adminId, 'platform_key.revoke', id, null);
}

/** Who a platform key acts for (the admin's e-mail is checked against the admin list by the caller). */
export async function platformKeyOwner(owner: Db, key: string): Promise<{ keyId: string; adminId: string; email: string; readOnly: boolean } | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const { rows } = await owner.query<{ keyId: string; adminId: string; email: string; readOnly: boolean }>(
    `update platform_api_key k set last_used_at = now() from "user" u
      where k.key_hash = $1 and k.revoked_at is null and u.id = k.created_by
      returning k.id as "keyId", k.created_by as "adminId", u.email, k.read_only as "readOnly"`, [hash(key)]);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- features granted to one company

export async function grantFeature(owner: Db, adminId: string, input: unknown): Promise<void> {
  const data = parse(z.object({
    orgId: z.string().min(1), feature: z.enum(PLAN_FEATURES),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(), reason: z.string().trim().max(300).nullable().optional(),
  }), input);
  const company = await owner.query('select 1 from organization where id = $1', [data.orgId]);
  if (!company.rowCount) throw notFound();
  await owner.query(
    `insert into company_feature_grant (org_id, feature, until, reason, granted_by) values ($1, $2, $3, $4, $5)
     on conflict (org_id, feature) do update set until = excluded.until, reason = excluded.reason, granted_by = excluded.granted_by, created_at = now()`,
    [data.orgId, data.feature, data.until ?? null, data.reason || null, adminId]);
  await journal(owner, adminId, 'feature.grant', data.orgId, { feature: data.feature, until: data.until ?? null, reason: data.reason ?? null });
}

export async function revokeFeatureGrant(owner: Db, adminId: string, orgId: string, feature: string): Promise<void> {
  await owner.query('delete from company_feature_grant where org_id = $1 and feature = $2', [orgId, feature]);
  await journal(owner, adminId, 'feature.revoke', orgId, { feature });
}

export async function featureGrants(owner: Db, orgId?: string) {
  const { rows } = await owner.query<{ orgId: string; company: string; feature: string; until: string | null; reason: string | null; active: boolean }>(
    `select g.org_id as "orgId", o.name as company, g.feature, to_char(g.until, 'YYYY-MM-DD') as until, g.reason,
            (g.until is null or g.until >= current_date) as active
       from company_feature_grant g join organization o on o.id = g.org_id
      where ($1::text is null or g.org_id = $1) order by o.name, g.feature`, [orgId ?? null]);
  return rows;
}

// ---------------------------------------------------------------- reading for assistants and routines

export interface CompanyFilter { plan?: string; status?: 'paying' | 'trial' | 'expired' | 'suspended'; expiresBefore?: string; idleDays?: number; country?: string; q?: string; includeDemo?: boolean; limit?: number }

/** Companies, filtered (demo excluded unless asked), with their getting-started steps. */
export async function listCompaniesFor(owner: Db, filter: CompanyFilter = {}) {
  const { rows } = await owner.query<{ orgId: string; name: string; createdAt: string; plan: string; country: string; currency: string; paidUntil: string | null; trialEndsAt: string | null; suspended: boolean; isDemo: boolean; users: number; projects: number; reports30: number; lastReport: string | null; ownerEmail: string | null }>(
    `select o.id as "orgId", o.name, to_char(o."createdAt", 'YYYY-MM-DD') as "createdAt", s.plan_code as plan, s.country_code as country, s.currency_code as currency,
            to_char(s.paid_until, 'YYYY-MM-DD') as "paidUntil", to_char(s.trial_ends_at, 'YYYY-MM-DD') as "trialEndsAt", s.suspended_at is not null as suspended, s.is_demo as "isDemo",
            (select count(*) from member m where m."organizationId" = o.id)::int as users,
            (select count(*) from project p where p.org_id = o.id and p.archived_at is null)::int as projects,
            (select count(*) from site_report r where r.org_id = o.id and r.created_at > now() - interval '30 days')::int as reports30,
            to_char((select max(r.created_at) from site_report r where r.org_id = o.id), 'YYYY-MM-DD') as "lastReport",
            (select u.email from member m join "user" u on u.id = m."userId" where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as "ownerEmail"
       from organization o join org_settings s on s.org_id = o.id
      where not exists (select 1 from demo_sandbox d where d.org_id = o.id)
        and ($1 or (not s.is_demo and not s.is_internal))
        and ($2::text is null or s.plan_code = $2)
        and ($3::text is null
             or ($3 = 'paying' and s.paid_until > now() and s.plan_code <> 'trial')
             or ($3 = 'trial' and s.plan_code = 'trial' and s.trial_ends_at > now())
             or ($3 = 'expired' and ((s.paid_until is not null and s.paid_until < now()) or (s.plan_code = 'trial' and s.trial_ends_at < now())))
             or ($3 = 'suspended' and s.suspended_at is not null))
        and ($4::date is null or coalesce(s.paid_until, s.trial_ends_at) < $4::date)
        and ($5::int is null or not exists (select 1 from site_report r where r.org_id = o.id and r.created_at > now() - make_interval(days => $5::int)))
        and ($6::text is null or s.country_code = upper($6))
        and ($7::text is null or o.name ilike '%' || $7 || '%')
      order by o."createdAt" desc limit $8`,
    [Boolean(filter.includeDemo), filter.plan ?? null, filter.status ?? null, filter.expiresBefore ?? null, filter.idleDays ?? null, filter.country ?? null, filter.q ?? null, Math.min(filter.limit ?? 100, 500)]);
  const steps = await onboardingSteps(owner);
  return rows.map((row) => ({ ...row, steps: steps[row.orgId] ?? null }));
}

/** What changed on the platform since a moment: what a routine reports without repeating itself. */
export async function changesSince(owner: Db, since: string) {
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) throw new DomainError('invalid_input', 422, { field: 'since', detail: '' });
  const p = [at.toISOString()];
  const [companies, licences, payments, expired, feedback, leads, claims] = await Promise.all([
    owner.query(`select o.id as "orgId", o.name, s.country_code as country, to_char(o."createdAt", 'YYYY-MM-DD') as at from organization o join org_settings s on s.org_id = o.id
                  where not s.is_demo and not s.is_internal and o."createdAt" > $1 and not exists (select 1 from demo_sandbox d where d.org_id = o.id) order by o."createdAt"`, p),
    owner.query(`select o.name, r.plan_code as plan, r.months, to_char(r.redeemed_at, 'YYYY-MM-DD') as at from license_redemption r join organization o on o.id = r.org_id
                  join org_settings s on s.org_id = r.org_id where not s.is_demo and not s.is_internal and r.redeemed_at > $1 order by r.redeemed_at`, p),
    owner.query(`select o.name, sp.amount_minor::float8 as "amountMinor", sp.currency_code as currency, to_char(sp.paid_at, 'YYYY-MM-DD') as at from subscription_payment sp
                  join organization o on o.id = sp.org_id join org_settings s on s.org_id = sp.org_id where not s.is_demo and not s.is_internal and sp.status = 'succeeded' and sp.paid_at > $1`, p),
    owner.query(`select o.name, s.plan_code as plan, to_char(s.paid_until, 'YYYY-MM-DD') as at from organization o join org_settings s on s.org_id = o.id
                  where not s.is_demo and not s.is_internal and s.paid_until between $1 and now()`, p),
    owner.query(`select o.name as company, f.kind, left(f.body, 300) as body, to_char(f.created_at, 'YYYY-MM-DD') as at from feedback f join organization o on o.id = f.org_id where f.created_at > $1 order by f.created_at`, p),
    owner.query(`select coalesce(nullif(company, ''), name) as name, reach, left(message, 300) as message, to_char(created_at, 'YYYY-MM-DD') as at from contact_request where created_at > $1 order by created_at`, p),
    owner.query(`select count(*)::int as n from payment_claim c join org_settings s on s.org_id = c.org_id where not s.is_demo and c.created_at > $1`, p),
  ]);
  return {
    since: at.toISOString(),
    newCompanies: companies.rows, licencesSold: licences.rows, subscriptionPayments: payments.rows, expired: expired.rows,
    feedback: feedback.rows, contactRequests: leads.rows, paymentsDeclaredByClients: (claims.rows[0] as { n: number } | undefined)?.n ?? 0,
  };
}

/** The whole point in one call: money, to do, health, platform, what changed over the last 7 days. */
export async function platformBrief(owner: Db) {
  const [money, todo, health, runs, week] = await Promise.all([
    founderMoney(owner), founderTodo(owner), productHealth(owner), platformRuns(owner), changesSince(owner, new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  return {
    at: new Date().toISOString(),
    money: { mrr: money.mrr, paying: money.paying, trials: money.trials, companies: money.companies, revenueByMonth: money.months },
    todo: { count: todo.length, items: todo.slice(0, 25) },
    health: { northStar: health.weeks.at(-1) ?? null, activation: health.activation, usage: health.usage, retention: health.retention, conversion: health.conversion, signups30: health.signups30 },
    platform: { jobs: runs.jobs, failedSends7d: runs.failedSends7d, aiThisMonth: runs.aiThisMonth, demo: runs.demo },
    lastSevenDays: week,
  };
}

// ---------------------------------------------------------------- OAuth connections (spec 056 bis)

/** A platform admin connects an assistant (OAuth client) to the console, read-only or not. */
export async function grantPlatformMcp(owner: Db, userId: string, clientId: string, readOnly: boolean): Promise<void> {
  await owner.query(
    `insert into platform_mcp_grant (user_id, client_id, read_only) values ($1, $2, $3)
     on conflict (user_id, client_id) do update set read_only = excluded.read_only, created_at = now()`, [userId, clientId.slice(0, 200), readOnly]);
  await journal(owner, userId, 'platform_mcp.connect', clientId.slice(0, 200), { readOnly });
}

export async function platformMcpGrant(owner: Db, userId: string, clientId: string): Promise<{ readOnly: boolean; email: string } | null> {
  const { rows } = await owner.query<{ readOnly: boolean; email: string }>(
    `select g.read_only as "readOnly", u.email from platform_mcp_grant g join "user" u on u.id = g.user_id where g.user_id = $1 and g.client_id = $2`, [userId, clientId]);
  return rows[0] ?? null;
}

export async function listPlatformMcpGrants(owner: Db) {
  const { rows } = await owner.query<{ userId: string; clientId: string; clientName: string; email: string; readOnly: boolean; createdAt: string }>(
    `select g.user_id as "userId", g.client_id as "clientId", coalesce(c.name, g.client_id) as "clientName", u.email, g.read_only as "readOnly",
            to_char(g.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
       from platform_mcp_grant g join "user" u on u.id = g.user_id left join "oauthClient" c on c."clientId" = g.client_id order by g.created_at desc`);
  return rows;
}

export async function revokePlatformMcpGrant(owner: Db, adminId: string, userId: string, clientId: string): Promise<void> {
  await owner.query('delete from platform_mcp_grant where user_id = $1 and client_id = $2', [userId, clientId]);
  await journal(owner, adminId, 'platform_mcp.revoke', clientId, { userId });
}
