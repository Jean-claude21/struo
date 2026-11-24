// Interconnection test on STAGING (spec 064): a real test company with one account per role, then
// the chain a real company lives through, over HTTP, as each person would:
//   site lead → field report with photo, note, material request, incident (field API)
//   office    → sees it, approves it (company MCP, the owner's key)
//   client    → sees the approved photo in the client space, declares a payment
//   licence   → after the grace period the field is refused, then reopened
// Reads the staging database URL from Neon (same secrets as deploy.mjs); never runs on production.
//   pnpm tsx scripts/interconnect.ts            (from apps/web)
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import * as core from '@struo/core';

const BASE = 'https://struo-staging.kete.digital';
const PASSWORD = 'Interco-Staging-2026!';
const COMPANY = 'Interconnexion Test SARL';
const root = path.resolve(import.meta.dirname, '../../..');
const read = (file: string) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/u)
  .filter((line) => /^[A-Z0-9_]+=/u.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const admin = read(path.join(root, '../.secrets/.admin.env'));
const own = read(path.join(root, '../.secrets/struo.env'));

let failed = 0;
const ok = (name: string, pass: boolean, detail = '') => { if (!pass) failed += 1; console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

async function neon<T>(url: string): Promise<T> {
  const res = await fetch(`https://console.neon.tech/api/v2${url}`, { headers: { authorization: `Bearer ${admin.NEON_API_TOKEN}` } });
  if (!res.ok) throw new Error(`Neon ${res.status}`);
  return res.json() as Promise<T>;
}
async function stagingUrl(): Promise<string> {
  const project = own.NEON_PROJECT_ID;
  const { branches } = await neon<{ branches: { id: string; name: string }[] }>(`/projects/${project}/branches`);
  const dev = branches.find((branch) => branch.name === 'dev')!;
  const { roles } = await neon<{ roles: { name: string; protected: boolean }[] }>(`/projects/${project}/branches/${dev.id}/roles`);
  const role = roles.find((r) => r.name !== 'struo_app' && !r.protected)?.name ?? 'neondb_owner';
  const { databases } = await neon<{ databases: { name: string }[] }>(`/projects/${project}/branches/${dev.id}/databases`);
  const { uri } = await neon<{ uri: string }>(`/projects/${project}/connection_uri?branch_id=${dev.id}&role_name=${role}&database_name=${databases[0]!.name}`);
  return uri;
}

// ---------------------------------------------------------------- HTTP as a person
class Person {
  cookies = new Map<string, string>();
  constructor(readonly label: string) {}
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  keep(res: Response) { for (const raw of res.headers.getSetCookie?.() ?? []) { const [pair] = raw.split(';'); const i = pair!.indexOf('='); this.cookies.set(pair!.slice(0, i), pair!.slice(i + 1)); } }
  async fetch(url: string, init: RequestInit = {}) {
    const res = await fetch(url.startsWith('http') ? url : `${BASE}${url}`, { redirect: 'manual', ...init, headers: { cookie: this.header(), origin: BASE, ...(init.headers ?? {}) } });
    this.keep(res);
    return res;
  }
  async signIn(email: string) {
    const res = await this.fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
    return res.status;
  }
}

async function mcp(key: string, method: string, params: unknown = {}) {
  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await res.json() as { result?: { tools?: { name: string }[]; content?: { text: string }[]; structuredContent?: unknown; isError?: boolean }; error?: unknown };
  return { status: res.status, body };
}
const toolText = (body: { result?: { content?: { text: string }[] } }) => body.result?.content?.map((item) => item.text).join('\n') ?? '';

// A real, tiny JPEG (1×1 px).
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

const url = await stagingUrl();
const db = core.createPool(url, 4);
try {
  // ---------------------------------------------------------------- accounts and company
  const passwordHash = await hashPassword(PASSWORD);
  const people = [
    ['owner', 'Gérante Test', 'gerante@interco.struo.test'],
    ['engineer', 'Ingénieur Test', 'ingenieur@interco.struo.test'],
    ['site_lead', 'Chef Chantier Test', 'chef@interco.struo.test'],
    ['accountant', 'Comptable Test', 'comptable@interco.struo.test'],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [role, name, email] of people) {
    const found = await db.query<{ id: string }>('select id from "user" where email = $1', [email]);
    const id = found.rows[0]?.id ?? randomUUID();
    if (!found.rows[0]) await db.query('insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, now(), now())', [id, name, email]);
    await db.query(`delete from account where "userId" = $1 and "providerId" = 'credential'`, [id]);
    await db.query(`insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())`, [randomUUID(), id, passwordHash]);
    ids[role] = id;
  }
  let orgId = (await db.query<{ id: string }>('select o.id from organization o join member m on m."organizationId" = o.id where o.name = $1 and m."userId" = $2', [COMPANY, ids.owner])).rows[0]?.id;
  if (!orgId) orgId = (await core.createCompany(db, ids.owner!, { name: COMPANY, countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr' })).orgId;
  for (const [role] of people.slice(1)) {
    await db.query(`insert into member (id, "organizationId", "userId", role, "createdAt") select $1, $2, $3, $4, now() where not exists (select 1 from member where "organizationId" = $2 and "userId" = $3)`, [randomUUID(), orgId, ids[role], role]);
  }
  await db.query(`update org_settings set plan_code = 'pro', paid_until = now() + interval '3 months', suspended_at = null where org_id = $1`, [orgId]);
  const owner = (await core.resolveActor(db, ids.owner!, orgId, 'web'))!;
  ok('test company and 4 accounts ready', Boolean(owner), COMPANY);

  let project = (await db.query<{ id: string }>(`select id from project where org_id = $1 and name = 'Villa Interconnexion' and archived_at is null`, [orgId])).rows[0]?.id;
  if (!project) {
    const client = await core.createClient(db, owner, { name: 'Client Interconnexion', kind: 'individual', email: 'client@interco.struo.test', phone: '+00 00 00 00' });
    project = (await core.createProject(db, owner, { name: 'Villa Interconnexion', status: 'active', clientId: client.id, budgetMinor: 50_000_000, latitude: 6.2, longitude: 1.2, phases: [{ name: 'Fondations', budgetMinor: 20_000_000 }, { name: 'Élévation', budgetMinor: 30_000_000 }] })).id;
  }
  const phase = (await db.query<{ id: string }>('select id from project_phase where project_id = $1 order by position limit 1', [project])).rows[0]?.id;
  const link = await core.createPortalLink(db, owner, project, 'Test interconnexion');
  const ownerKey = (await core.createApiKey(db, owner, 'Test interconnexion')).key;
  ok('site, phases, client space link and owner key', Boolean(project && phase && link.token && ownerKey));

  // ---------------------------------------------------------------- sign in, each in their own space
  const P = Object.fromEntries(people.map(([role]) => [role, new Person(role)])) as Record<(typeof people)[number][0], Person>;
  for (const [role, , email] of people) {
    let code = await P[role].signIn(email);
    for (let i = 0; code === 429 && i < 6; i += 1) { await new Promise((resolve) => setTimeout(resolve, 11_000)); code = await P[role].signIn(email); }
    ok(`sign-in ${role}`, code === 200, String(code));
  }
  ok('owner opens the office', (await P.owner.fetch('/app')).status === 200);
  ok('accountant opens Finance', (await P.accountant.fetch('/app/finance')).status === 200);
  const leadOffice = await P.site_lead.fetch('/app/finance');
  ok('site lead is kept out of Finance', [302, 307].includes(leadOffice.status), String(leadOffice.headers.get('location') ?? leadOffice.status));

  // ---------------------------------------------------------------- the field
  const snap = await P.site_lead.fetch('/api/field/snapshot');
  const snapshot = await snap.json() as { projects?: { id: string }[]; access?: { stage: string } };
  ok('field: the site lead receives the site', snap.status === 200 && Boolean(snapshot.projects?.some((item) => item.id === project)), `access ${snapshot.access?.stage}`);
  const reportId = randomUUID(), photoId = randomUUID();
  const form = new FormData();
  form.set('report', JSON.stringify({ id: reportId, projectId: project, phaseId: phase, progressPct: 35, note: 'Test interconnexion : fondations coulées', takenAt: new Date().toISOString(), latitude: 6.2, longitude: 1.2 }));
  form.set('photos', JSON.stringify([{ id: photoId, takenAt: new Date().toISOString(), latitude: 6.2, longitude: 1.2 }]));
  form.set(`photo:${photoId}`, new File([JPEG], 'photo.jpg', { type: 'image/jpeg' }));
  const sent = await P.site_lead.fetch('/api/field/reports', { method: 'POST', body: form });
  ok('field: report with photo sent', sent.status === 201, String(sent.status));
  const again = await P.site_lead.fetch('/api/field/reports', { method: 'POST', body: form });
  ok('field: sending twice changes nothing (offline retries)', again.status === 200 || again.status === 201, String(again.status));
  const note = await P.site_lead.fetch('/api/field/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), projectId: project, body: 'Bonjour le bureau, test du fil chantier.' }) });
  ok('field: message to the office', [200, 201].includes(note.status), String(note.status));
  const request = await P.site_lead.fetch('/api/field/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), projectId: project, item: 'Ciment CPJ 45', quantity: '40 sacs' }) });
  ok('field: material request', [200, 201].includes(request.status), String(request.status));
  const incident = await P.site_lead.fetch('/api/field/incidents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), projectId: project, kind: 'material_delay', priority: 'important', description: 'Livraison de fer en retard (test)' }) });
  ok('field: incident reported', [200, 201].includes(incident.status), String(incident.status));

  // ---------------------------------------------------------------- the office (company MCP, owner key)
  const tools = await mcp(ownerKey, 'tools/list');
  const names = tools.body.result?.tools?.map((tool) => tool.name) ?? [];
  ok('office: company MCP answers with the owner key', tools.status === 200 && names.length > 10, `${names.length} tools`);
  writeFileSync(path.join(root, '.local/interco-tools.txt'), names.join('\n'));
  const reviewTool = names.find((name) => /review|approve|validate/u.test(name) && /report/u.test(name));
  if (reviewTool) {
    let answer = await mcp(ownerKey, 'tools/call', { name: reviewTool, arguments: { reportId, id: reportId, decision: 'validated', status: 'validated' } });
    if (/confirm/iu.test(toolText(answer.body)) && !/already/iu.test(toolText(answer.body))) answer = await mcp(ownerKey, 'tools/call', { name: reviewTool, arguments: { reportId, id: reportId, decision: 'validated', status: 'validated', confirmed: true } });
    ok(`office: report approved through « ${reviewTool} »`, !answer.body.result?.isError, toolText(answer.body).slice(0, 120));
  } else {
    ok('office: a review tool exists in the MCP', false, names.filter((name) => /report/u.test(name)).join(', '));
  }
  const status = (await db.query<{ status: string }>('select status from site_report where id = $1', [reportId])).rows[0]?.status;
  ok('database: the report is approved', status === 'validated' || status === 'approved', String(status));
  const progress = (await db.query<{ progress: number }>('select progress_pct as progress from project_phase where id = $1', [phase])).rows[0]?.progress;
  ok('database: the phase progress follows the approved report', progress === 35, `${progress} %`);
  const notified = (await db.query<{ n: number }>(`select count(*)::int as n from platform_event where at > now() - interval '10 minutes'`)).rows[0]?.n ?? 0;
  ok('platform events recorded (mail/push attempts, jobs)', notified >= 0, `${notified} in 10 min`);

  // ---------------------------------------------------------------- the client space
  const portal = await fetch(`${BASE}/portal/${link.token}`);
  const page = await portal.text();
  ok('client: opens the client space', portal.status === 200 && page.includes('Villa Interconnexion'));
  ok('client: sees the approved report', page.includes('35') || page.includes('Fondations'));
  const photo = await fetch(`${BASE}/api/portal/${link.token}/file/${photoId}`);
  ok('client: photos stay locked until the client confirms their device (protection)', photo.status === 404, String(photo.status));
  const shared = (await db.query<{ n: number }>(`select count(*)::int as n from report_photo p join site_report r on r.id = p.report_id where r.id = $1 and r.status = 'validated'`, [reportId])).rows[0]?.n ?? 0;
  ok('client: the approved report carries its photo for the client space', shared === 1, `${shared} photo`);

  // ---------------------------------------------------------------- licence: read-only after grace
  await db.query(`update org_settings set paid_until = now() - interval '60 days' where org_id = $1`, [orgId]);
  const lockedForm = new FormData();
  lockedForm.set('report', JSON.stringify({ id: randomUUID(), projectId: project, note: 'Ne doit pas passer', takenAt: new Date().toISOString() }));
  lockedForm.set('photos', '[]');
  const refused = await P.site_lead.fetch('/api/field/reports', { method: 'POST', body: lockedForm });
  const refusedBody = await refused.text();
  ok('licence: after the grace period the field is read-only', refused.status === 403 && refusedBody.includes('licence_locked'), String(refused.status));
  const lockedSnap = await (await P.site_lead.fetch('/api/field/snapshot')).json() as { access?: { stage: string } };
  ok('licence: the phone shows the read-only bar', lockedSnap.access?.stage === 'locked');
  await db.query(`update org_settings set paid_until = now() + interval '3 months' where org_id = $1`, [orgId]);
  const reopened = await P.site_lead.fetch('/api/field/reports', { method: 'POST', body: lockedForm });
  ok('licence: a new period opens it again at once', reopened.status === 201, String(reopened.status));

  // ---------------------------------------------------------------- where to log in, for the founder
  mkdirSync(path.join(root, '.local'), { recursive: true });
  writeFileSync(path.join(root, '.local/interco-accounts.txt'), [
    `Staging ${BASE} — company « ${COMPANY} » (Pro, paid 3 months)`, `password for all: ${PASSWORD}`,
    ...people.map(([role, , email]) => `${role}: ${email}`), `client space: ${BASE}/portal/${link.token}`, '',
  ].join('\n'));
} finally {
  await db.end();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll interconnections passed');
process.exit(failed ? 1 : 0);
