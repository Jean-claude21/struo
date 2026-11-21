import { z } from 'zod';
import { asActor, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';

/**
 * Spec 055: the founder's console. Figures that are true (demo companies never count, each currency
 * apart, licence sales counted), who to call today, where each company is stuck, whether the
 * platform runs, announcements, what users report, and the plans — edited with care: every change
 * shows who it touches first, and every version is kept and can be restored.
 *
 * Everything here runs on the platform (owner) connection, for platform admins only.
 */

type Query = Pick<Tx, 'query'>;

async function journalAdmin(owner: Db, adminId: string, command: string, target: string | null, detail: unknown): Promise<void> {
  await owner.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)', [adminId, command, target, JSON.stringify(detail ?? null)]);
}

// ---------------------------------------------------------------- events the platform records

export type PlatformEventKind = 'job' | 'mail_failed' | 'push_failed' | 'demo_opened' | 'demo_leave' | 'signup';

/** Notes what the platform did (a job run, a failed send, a demo opened, a sign-up). Never blocks. */
export async function recordPlatformEvent(owner: Db, event: { kind: PlatformEventKind; name?: string | null; ok?: boolean | null; orgId?: string | null; detail?: unknown }): Promise<void> {
  await owner.query('insert into platform_event (kind, name, ok, org_id, detail) values ($1, $2, $3, $4, $5)',
    [event.kind, event.name ?? null, event.ok ?? null, event.orgId ?? null, event.detail === undefined ? null : JSON.stringify(event.detail)]).catch(() => undefined);
}

// ---------------------------------------------------------------- money, true

export interface FounderMoney {
  /** Monthly recurring revenue per currency, of companies paid up today (demo excluded). */
  mrr: { currency: string; amountMinor: number; companies: number }[];
  /** Revenue per month and currency over 6 months: subscription payments and licence sales. */
  months: { month: string; currency: string; amountMinor: number; sales: number }[];
  paying: number;
  trials: number;
  companies: number;
}

export async function founderMoney(owner: Db): Promise<FounderMoney> {
  const [mrr, months, counts] = await Promise.all([
    owner.query<{ currency: string; amountMinor: number; companies: number }>(
      `select s.currency_code as currency, coalesce(sum(coalesce(pp.price_minor, case when p.currency_code = s.currency_code then p.price_minor end, 0)), 0)::float8 as "amountMinor",
              count(*)::int as companies
         from org_settings s join plan p on p.code = s.plan_code left join plan_price pp on pp.plan_code = p.code and pp.currency_code = s.currency_code
        where not s.is_demo and s.paid_until > now() and s.plan_code <> 'trial' group by s.currency_code order by 2 desc`),
    owner.query<{ month: string; currency: string; amountMinor: number; sales: number }>(
      `with sales as (
         select date_trunc('month', sp.paid_at) as month, sp.currency_code as currency, sp.amount_minor::float8 as amount
           from subscription_payment sp join org_settings s on s.org_id = sp.org_id
          where sp.status = 'succeeded' and not s.is_demo and sp.paid_at > date_trunc('month', now()) - interval '5 months'
         union all
         select date_trunc('month', r.redeemed_at), s.currency_code, (coalesce(pp.price_minor, 0) * r.months)::float8
           from license_redemption r join org_settings s on s.org_id = r.org_id
           left join plan_price pp on pp.plan_code = r.plan_code and pp.currency_code = s.currency_code
          where not s.is_demo and r.redeemed_at > date_trunc('month', now()) - interval '5 months')
       select to_char(month, 'YYYY-MM') as month, currency, sum(amount)::float8 as "amountMinor", count(*)::int as sales
         from sales group by month, currency order by month, currency`),
    owner.query<{ paying: number; trials: number; companies: number }>(
      `select count(*) filter (where paid_until > now() and plan_code <> 'trial')::int as paying,
              count(*) filter (where plan_code = 'trial' and trial_ends_at > now())::int as trials,
              count(*)::int as companies
         from org_settings where not is_demo`),
  ]);
  return { mrr: mrr.rows, months: months.rows, ...counts.rows[0]! };
}

// ---------------------------------------------------------------- who to call today

export interface FounderTodo {
  kind: 'trial_idle' | 'paying_slowing' | 'expiring' | 'expired' | 'lead' | 'feedback' | 'note';
  orgId: string | null; name: string; detail: string | null; at: string | null; email: string | null; phone: string | null;
}

/** What the founder should handle today, most urgent first. */
export async function founderTodo(owner: Db): Promise<FounderTodo[]> {
  const contact = `(select u.email from member m join "user" u on u.id = m."userId" where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as email,
                   (select i.phone from invoice_settings i where i.org_id = o.id) as phone`;
  const real = `join org_settings s on s.org_id = o.id and not s.is_demo`;
  const [idle, slowing, expiring, expired, leads, feedback, notes] = await Promise.all([
    owner.query<FounderTodo>(
      `select 'trial_idle' as kind, o.id as "orgId", o.name, to_char(s.trial_ends_at, 'YYYY-MM-DD') as at, null as detail, ${contact}
         from organization o ${real}
        where s.plan_code = 'trial' and s.trial_ends_at between now() and now() + interval '7 days'
          and not exists (select 1 from site_report r where r.org_id = o.id and r.created_at > now() - interval '7 days')`),
    owner.query<FounderTodo>(
      `select 'paying_slowing' as kind, o.id as "orgId", o.name, to_char((select max(r.created_at) from site_report r where r.org_id = o.id), 'YYYY-MM-DD') as at, null as detail, ${contact}
         from organization o ${real}
        where s.paid_until > now() and s.plan_code <> 'trial'
          and exists (select 1 from site_report r where r.org_id = o.id)
          and not exists (select 1 from site_report r where r.org_id = o.id and r.created_at > now() - interval '14 days')`),
    owner.query<FounderTodo>(
      `select 'expiring' as kind, o.id as "orgId", o.name, to_char(s.paid_until, 'YYYY-MM-DD') as at, s.plan_code as detail, ${contact}
         from organization o ${real} where s.paid_until between now() and now() + interval '14 days'`),
    owner.query<FounderTodo>(
      `select 'expired' as kind, o.id as "orgId", o.name, to_char(s.paid_until, 'YYYY-MM-DD') as at, s.plan_code as detail, ${contact}
         from organization o ${real} where s.paid_until between now() - interval '30 days' and now()`),
    owner.query<FounderTodo>(
      `select 'lead' as kind, null as "orgId", coalesce(nullif(company, ''), name) as name, left(message, 160) as detail, to_char(created_at, 'YYYY-MM-DD') as at,
              case when reach like '%@%' then reach end as email, case when reach not like '%@%' then reach end as phone
         from contact_request where handled_at is null order by created_at desc limit 20`),
    owner.query<FounderTodo>(
      `select 'feedback' as kind, o.id as "orgId", o.name, left(f.body, 160) as detail, to_char(f.created_at, 'YYYY-MM-DD') as at, u.email, null as phone
         from feedback f join organization o on o.id = f.org_id left join "user" u on u.id = f.user_id
        where f.handled_at is null and f.kind = 'problem' order by f.created_at desc limit 20`),
    owner.query<FounderTodo>(
      `select distinct on (n.org_id) 'note' as kind, o.id as "orgId", o.name, left(n.body, 160) as detail, to_char(n.next_on, 'YYYY-MM-DD') as at, ${contact}
         from company_note n join organization o on o.id = n.org_id
        where n.next_on is not null and n.next_on <= current_date order by n.org_id, n.created_at desc`),
  ]);
  return [...notes.rows, ...feedback.rows, ...expired.rows, ...expiring.rows, ...idle.rows, ...slowing.rows, ...leads.rows];
}

// ---------------------------------------------------------------- where each company stands

export const ONBOARDING_STEPS = ['site', 'team', 'report', 'validated', 'invoice', 'client'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The first steps of every real company: done or not, so the founder sees where each one is stuck. */
export async function onboardingSteps(owner: Db, orgId?: string): Promise<Record<string, Record<OnboardingStep, boolean>>> {
  const { rows } = await owner.query<{ orgId: string } & Record<OnboardingStep, boolean>>(
    `select o.id as "orgId",
            exists (select 1 from project p where p.org_id = o.id) as site,
            (select count(*) from member m where m."organizationId" = o.id) > 1 as team,
            exists (select 1 from site_report r where r.org_id = o.id) as report,
            exists (select 1 from site_report r where r.org_id = o.id and r.status = 'validated') as validated,
            exists (select 1 from invoice i where i.org_id = o.id and i.status = 'issued') as invoice,
            exists (select 1 from portal_link l where l.org_id = o.id) as client
       from organization o join org_settings s on s.org_id = o.id
      where not s.is_demo and ($1::text is null or o.id = $1)`, [orgId ?? null]);
  return Object.fromEntries(rows.map(({ orgId: id, ...steps }) => [id, steps]));
}

// ---------------------------------------------------------------- does the platform run?

export async function platformRuns(owner: Db) {
  const [jobs, sends, ai, demo] = await Promise.all([
    owner.query<{ name: string; lastAt: string; lastOk: boolean; failures24h: number }>(
      `select name, to_char(max(at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastAt",
              (array_agg(ok order by at desc))[1] as "lastOk",
              count(*) filter (where not ok and at > now() - interval '24 hours')::int as "failures24h"
         from platform_event where kind = 'job' and at > now() - interval '7 days' group by name order by name`),
    owner.query<{ mail: number; push: number }>(
      `select count(*) filter (where kind = 'mail_failed')::int as mail, count(*) filter (where kind = 'push_failed')::int as push
         from platform_event where at > now() - interval '7 days'`),
    owner.query<{ turns: number; cents: number }>(
      `select count(*)::int as turns, round(coalesce(sum(cost_microusd), 0) / 10000.0)::int as cents from ai_usage where at >= date_trunc('month', now())`),
    owner.query<{ name: string | null; opened: number }>(
      `select name, count(*)::int as opened from platform_event where kind = 'demo_opened' and at > now() - interval '30 days' group by name order by 2 desc`),
  ]);
  const { rows: [funnel] } = await owner.query<{ leaves: number; signups: number }>(
    `select count(*) filter (where kind = 'demo_leave')::int as leaves, count(*) filter (where kind = 'signup')::int as signups
       from platform_event where at > now() - interval '30 days'`);
  return {
    jobs: jobs.rows,
    failedSends7d: sends.rows[0] ?? { mail: 0, push: 0 },
    aiThisMonth: ai.rows[0] ?? { turns: 0, cents: 0 },
    demo: { byRole: demo.rows, opened: demo.rows.reduce((sum, row) => sum + row.opened, 0), leaves: funnel?.leaves ?? 0, signups: funnel?.signups ?? 0 },
  };
}

// ---------------------------------------------------------------- follow-up notes

export async function companyNotes(owner: Db, orgId: string) {
  const { rows } = await owner.query<{ id: string; body: string; nextOn: string | null; adminName: string | null; createdAt: string }>(
    `select n.id, n.body, to_char(n.next_on, 'YYYY-MM-DD') as "nextOn", u.name as "adminName", to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
       from company_note n left join "user" u on u.id = n.admin_id where n.org_id = $1 order by n.created_at desc limit 50`, [orgId]);
  return rows;
}

export async function addCompanyNote(owner: Db, adminId: string, input: unknown): Promise<void> {
  const data = parse(z.object({ orgId: z.string().min(1), body: z.string().trim().min(1).max(2000), nextOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional() }), input);
  await owner.query('insert into company_note (org_id, admin_id, body, next_on) values ($1, $2, $3, $4)', [data.orgId, adminId, data.body, data.nextOn ?? null]);
}

/** A follow-up done: its reminder date is cleared (the note stays). */
export async function clearNoteReminders(owner: Db, orgId: string): Promise<void> {
  await owner.query('update company_note set next_on = null where org_id = $1 and next_on <= current_date', [orgId]);
}

// ---------------------------------------------------------------- announcements

export interface Announcement { id: string; title: string; body: string | null; level: 'info' | 'warning'; startsAt: string; endsAt: string | null; emailedAt: string | null }
const announcementColumns = `id, title, body, level, to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startsAt",
  to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "endsAt", to_char(emailed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "emailedAt"`;

/** The announcement shown in the app now (the latest that started and has not ended). */
export async function currentAnnouncement(db: Db): Promise<Announcement | null> {
  const { rows } = await db.query<Announcement>(
    `select ${announcementColumns} from announcement where starts_at <= now() and (ends_at is null or ends_at > now()) order by starts_at desc limit 1`);
  return rows[0] ?? null;
}

export async function listAnnouncements(owner: Db): Promise<Announcement[]> {
  const { rows } = await owner.query<Announcement>(`select ${announcementColumns} from announcement order by created_at desc limit 30`);
  return rows;
}

export async function createAnnouncement(owner: Db, adminId: string, input: unknown): Promise<{ id: string }> {
  const data = parse(z.object({
    title: z.string().trim().min(1).max(120), body: z.string().trim().max(1000).nullable().optional(), level: z.enum(['info', 'warning']).default('info'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  }), input);
  const { rows } = await owner.query<{ id: string }>(
    `insert into announcement (title, body, level, ends_at, created_by) values ($1, $2, $3, $4::date + interval '1 day', $5) returning id`,
    [data.title, data.body || null, data.level, data.endsOn ?? null, adminId]);
  await journalAdmin(owner, adminId, 'announcement.create', rows[0]!.id, data);
  return { id: rows[0]!.id };
}

export async function endAnnouncement(owner: Db, adminId: string, id: string): Promise<void> {
  await owner.query('update announcement set ends_at = now() where id = $1 and (ends_at is null or ends_at > now())', [id]);
  await journalAdmin(owner, adminId, 'announcement.end', id, null);
}

/** The owners of every real company, to e-mail an announcement once. */
export async function announcementRecipients(owner: Db, id: string): Promise<{ email: string; locale: 'fr' | 'en' }[] | null> {
  const { rowCount } = await owner.query('update announcement set emailed_at = now() where id = $1 and emailed_at is null', [id]);
  if (!rowCount) return null;
  const { rows } = await owner.query<{ email: string; locale: 'fr' | 'en' }>(
    `select distinct u.email, s.locale from member m join "user" u on u.id = m."userId" join org_settings s on s.org_id = m."organizationId"
      where m.role = 'owner' and not s.is_demo and s.suspended_at is null`);
  return rows;
}

// ---------------------------------------------------------------- what users report

export async function submitFeedback(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = parse(z.object({ kind: z.enum(['problem', 'idea']), body: z.string().trim().min(2).max(4000), page: z.string().max(300).nullable().optional() }), input);
  await asActor(db, actor, async (tx) => {
    await tx.query('insert into feedback (org_id, user_id, kind, body, page) values ($1, $2, $3, $4, $5)', [actor.orgId, actor.userId, data.kind, data.body, data.page ?? null]);
  });
}

export async function listFeedback(owner: Db) {
  const { rows } = await owner.query<{ id: string; orgId: string; company: string; userName: string | null; email: string | null; kind: 'problem' | 'idea'; body: string; page: string | null; handledAt: string | null; createdAt: string }>(
    `select f.id, f.org_id as "orgId", o.name as company, u.name as "userName", u.email, f.kind, f.body, f.page,
            to_char(f.handled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "handledAt", to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
       from feedback f join organization o on o.id = f.org_id left join "user" u on u.id = f.user_id
      order by (f.handled_at is null) desc, f.created_at desc limit 100`);
  return rows;
}

export async function handleFeedback(owner: Db, adminId: string, id: string): Promise<void> {
  await owner.query('update feedback set handled_at = now() where id = $1', [id]);
  await journalAdmin(owner, adminId, 'feedback.handle', id, null);
}

// ---------------------------------------------------------------- plans, edited with care

/**
 * What a plan unlocks beyond the core (sites, field, finance, documents, planning — always there).
 * Each one is checked where it is used: unticking it takes it away from the plan's companies.
 */
export const PLAN_FEATURES = ['portal', 'ai', 'mcp', 'whatsapp'] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];
const CORE_FEATURES = ['field', 'finance', 'documents', 'planning'];

/** Refuses a gesture the company's plan does not include. */
export async function assertFeature(q: Query, orgId: string, feature: PlanFeature): Promise<void> {
  const { rows } = await q.query<{ ok: boolean }>(
    `select coalesce((select p.features ? $2 from org_settings s join plan p on p.code = s.plan_code where s.org_id = $1), true)
            or exists (select 1 from company_feature_grant g where g.org_id = $1 and g.feature = $2 and (g.until is null or g.until >= current_date)) as ok`, [orgId, feature]);
  if (!rows[0]?.ok) throw new DomainError('plan_feature', 403, { feature });
}

export async function planIncludes(q: Query, orgId: string, feature: PlanFeature): Promise<boolean> {
  try { await assertFeature(q, orgId, feature); return true; } catch { return false; }
}

export interface EditablePlan {
  code: string; name: string; nameEn: string | null; tagline: string | null; taglineEn: string | null; bullets: string | null; bulletsEn: string | null;
  maxUsers: number | null; maxProjects: number | null; features: string[]; highlight: boolean; public: boolean; position: number; updatedAt: string | null;
  companies: number; paying: number; trials: number;
  prices: { currency: string; priceMinor: number }[];
}

const planColumns = `p.code, p.name, p.name_en as "nameEn", p.tagline, p.tagline_en as "taglineEn", p.bullets, p.bullets_en as "bulletsEn",
  p.max_users as "maxUsers", p.max_projects as "maxProjects", p.features, p.highlight, p.public, p.position,
  to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"`;

/** Every plan (hidden ones too) with who is on it and its prices. */
export async function listEditablePlans(owner: Db): Promise<EditablePlan[]> {
  const { rows } = await owner.query<EditablePlan>(
    `select ${planColumns},
            (select count(*) from org_settings s where s.plan_code = p.code and not s.is_demo)::int as companies,
            (select count(*) from org_settings s where s.plan_code = p.code and not s.is_demo and s.paid_until > now())::int as paying,
            (select count(*) from org_settings s where s.plan_code = p.code and not s.is_demo and s.trial_ends_at > now() and s.paid_until is null)::int as trials,
            coalesce((select jsonb_agg(jsonb_build_object('currency', pp.currency_code, 'priceMinor', pp.price_minor) order by pp.currency_code) from plan_price pp where pp.plan_code = p.code), '[]') as prices
       from plan p order by p.position, p.code`);
  return rows;
}

const planInput = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,29}$/u),
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).nullable().optional(),
  tagline: z.string().trim().max(200).nullable().optional(),
  taglineEn: z.string().trim().max(200).nullable().optional(),
  bullets: z.string().trim().max(3000).nullable().optional(),
  bulletsEn: z.string().trim().max(3000).nullable().optional(),
  maxUsers: z.number().int().min(1).max(100_000).nullable(),
  maxProjects: z.number().int().min(1).max(100_000).nullable(),
  features: z.array(z.enum(PLAN_FEATURES)),
  highlight: z.boolean(),
  public: z.boolean(),
  position: z.number().int().min(0).max(100),
});
export type PlanDraft = z.infer<typeof planInput>;

export interface PlanImpact {
  isNew: boolean;
  companies: number; paying: number;
  /** Companies above the new limits: they keep everything, but cannot add more until under it. */
  overUsers: { orgId: string; name: string; count: number }[];
  overProjects: { orgId: string; name: string; count: number }[];
  /** What the plan's companies lose or gain. */
  featuresRemoved: string[]; featuresAdded: string[];
  /** A plan that disappears from the public offer still serves its current companies. */
  hidden: boolean;
}

/** What a change to a plan would do, before it is saved. */
export async function planImpact(owner: Db, input: unknown): Promise<PlanImpact> {
  const draft = parse(planInput, input);
  const { rows: [current] } = await owner.query<{ features: string[]; public: boolean }>('select features, public from plan where code = $1', [draft.code]);
  if (!current) return { isNew: true, companies: 0, paying: 0, overUsers: [], overProjects: [], featuresRemoved: [], featuresAdded: [], hidden: false };
  const [counts, users, projects] = await Promise.all([
    owner.query<{ companies: number; paying: number }>(
      `select count(*)::int as companies, count(*) filter (where paid_until > now())::int as paying from org_settings where plan_code = $1 and not is_demo`, [draft.code]),
    draft.maxUsers === null ? { rows: [] } : owner.query<{ orgId: string; name: string; count: number }>(
      `select o.id as "orgId", o.name, (select count(*) from member m where m."organizationId" = o.id)::int as count
         from organization o join org_settings s on s.org_id = o.id where s.plan_code = $1 and not s.is_demo
          and (select count(*) from member m where m."organizationId" = o.id) > $2 order by 3 desc limit 50`, [draft.code, draft.maxUsers]),
    draft.maxProjects === null ? { rows: [] } : owner.query<{ orgId: string; name: string; count: number }>(
      `select o.id as "orgId", o.name, (select count(*) from project p where p.org_id = o.id and p.archived_at is null and p.status <> 'done')::int as count
         from organization o join org_settings s on s.org_id = o.id where s.plan_code = $1 and not s.is_demo
          and (select count(*) from project p where p.org_id = o.id and p.archived_at is null and p.status <> 'done') > $2 order by 3 desc limit 50`, [draft.code, draft.maxProjects]),
  ]);
  const before = current.features.filter((feature) => (PLAN_FEATURES as readonly string[]).includes(feature));
  return {
    isNew: false, ...counts.rows[0]!,
    overUsers: users.rows, overProjects: projects.rows,
    featuresRemoved: before.filter((feature) => !draft.features.includes(feature as PlanFeature)),
    featuresAdded: draft.features.filter((feature) => !before.includes(feature)),
    hidden: current.public && !draft.public,
  };
}

/**
 * Saves a plan (new or changed). The previous version is kept first; when paying companies lose
 * something (a feature, a limit below their use) the change must be confirmed by typing the plan code.
 */
export async function savePlan(owner: Db, adminId: string, input: unknown, options: { confirmCode?: string; note?: string | null } = {}): Promise<{ created: boolean }> {
  const draft = parse(planInput, input);
  const impact = await planImpact(owner, draft);
  const hurts = impact.paying > 0 && (impact.featuresRemoved.length > 0 || impact.overUsers.length > 0 || impact.overProjects.length > 0);
  if (hurts && options.confirmCode !== draft.code) throw new DomainError('plan_confirm_required', 409, { code: draft.code });
  if (draft.code === 'trial' && !draft.public) throw new DomainError('invalid_input', 422, { field: 'public', detail: 'trial' });
  const features = [...CORE_FEATURES, ...draft.features];
  const client = await owner.connect();
  try {
    await client.query('begin');
    const { rows: [previous] } = await client.query<Record<string, unknown>>('select * from plan where code = $1 for update', [draft.code]);
    if (previous) {
      await client.query('insert into plan_revision (plan_code, snapshot, admin_id, note) values ($1, $2, $3, $4)', [draft.code, JSON.stringify(previous), adminId, options.note ?? null]);
      await client.query(
        `update plan set name = $2, name_en = $3, tagline = $4, tagline_en = $5, bullets = $6, bullets_en = $7, max_users = $8, max_projects = $9,
                features = $10, highlight = $11, public = $12, position = $13, updated_at = now() where code = $1`,
        [draft.code, draft.name, draft.nameEn || null, draft.tagline || null, draft.taglineEn || null, draft.bullets || null, draft.bulletsEn || null,
          draft.maxUsers, draft.maxProjects, JSON.stringify([...new Set(features)].concat((previous.features as string[]).filter((feature) => !(PLAN_FEATURES as readonly string[]).includes(feature) && !CORE_FEATURES.includes(feature)))),
          draft.highlight, draft.public, draft.position]);
    } else {
      await client.query(
        `insert into plan (code, name, name_en, tagline, tagline_en, bullets, bullets_en, price_minor, currency_code, max_users, max_projects, features, highlight, public, position, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, 0, 'XOF', $8, $9, $10, $11, $12, $13, now())`,
        [draft.code, draft.name, draft.nameEn || null, draft.tagline || null, draft.taglineEn || null, draft.bullets || null, draft.bulletsEn || null,
          draft.maxUsers, draft.maxProjects, JSON.stringify(features), draft.highlight, draft.public, draft.position]);
    }
    // One highlighted plan at most.
    if (draft.highlight) await client.query('update plan set highlight = false where code <> $1 and highlight', [draft.code]);
    await client.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)',
      [adminId, previous ? 'plan.update' : 'plan.create', draft.code, JSON.stringify({ ...draft, impact: { companies: impact.companies, paying: impact.paying, removed: impact.featuresRemoved }, note: options.note ?? null })]);
    await client.query('commit');
    return { created: !previous };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function planRevisions(owner: Db, code: string) {
  const { rows } = await owner.query<{ id: number; at: string; adminName: string | null; note: string | null; snapshot: Record<string, unknown> }>(
    `select r.id, to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at, u.name as "adminName", r.note, r.snapshot
       from plan_revision r left join "user" u on u.id = r.admin_id where r.plan_code = $1 order by r.at desc limit 30`, [code]);
  return rows;
}

/** Puts a previous version of a plan back (itself saved as a new version first). */
export async function restorePlanRevision(owner: Db, adminId: string, id: number, confirmCode?: string): Promise<void> {
  const { rows: [revision] } = await owner.query<{ code: string; snapshot: Record<string, unknown> }>('select plan_code as code, snapshot from plan_revision where id = $1', [id]);
  if (!revision) throw notFound();
  const snap = revision.snapshot;
  await savePlan(owner, adminId, {
    code: revision.code, name: snap.name, nameEn: snap.name_en ?? null, tagline: snap.tagline ?? null, taglineEn: snap.tagline_en ?? null,
    bullets: snap.bullets ?? null, bulletsEn: snap.bullets_en ?? null, maxUsers: snap.max_users ?? null, maxProjects: snap.max_projects ?? null,
    features: ((snap.features as string[]) ?? []).filter((feature) => (PLAN_FEATURES as readonly string[]).includes(feature)),
    highlight: Boolean(snap.highlight), public: snap.public !== false, position: Number(snap.position ?? 0),
  }, { confirmCode, note: `restore #${id}` });
}

/** The plans shown to buyers, in their language (public only). */
export async function publicPlanWords(db: Db, locale: 'fr' | 'en') {
  const { rows } = await db.query<{ code: string; name: string; tagline: string | null; bullets: string[]; highlight: boolean }>(
    `select code, case when $1 = 'en' then coalesce(name_en, name) else name end as name,
            case when $1 = 'en' then coalesce(tagline_en, tagline) else tagline end as tagline,
            coalesce(regexp_split_to_array(nullif(case when $1 = 'en' then coalesce(bullets_en, bullets) else bullets end, ''), E'\\s*\\n\\s*'), '{}') as bullets,
            highlight
       from plan where public order by position`, [locale]);
  return rows.map((row) => ({ ...row, bullets: row.bullets.filter(Boolean) }));
}

