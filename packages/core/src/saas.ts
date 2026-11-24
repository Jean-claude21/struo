import { asActor } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError } from './errors.ts';

export interface Plan {
  code: string;
  name: string;
  priceMinor: number;
  currencyCode: string;
  maxUsers: number | null;
  maxProjects: number | null;
  features: string[];
  /** Spec 055: the words buyers read, edited in the console (null: the catalogue's default). */
  nameEn?: string | null; tagline?: string | null; taglineEn?: string | null; bullets?: string | null; bulletsEn?: string | null; highlight?: boolean;
}

const PLAN_COLUMNS = `code, name, price_minor as "priceMinor", currency_code as "currencyCode",
  max_users as "maxUsers", max_projects as "maxProjects", features,
  name_en as "nameEn", tagline, tagline_en as "taglineEn", bullets, bullets_en as "bulletsEn", highlight`;

export async function listPlans(db: Db): Promise<Plan[]> {
  const { rows } = await db.query<Plan>(`select ${PLAN_COLUMNS} from plan where public order by position`);
  return rows;
}

/**
 * The public plans priced in one currency (spec 045). A plan without a price in that currency keeps
 * `priceMinor` 0 and is shown on quote: a price is never converted from another currency.
 */
export async function listPlansIn(db: Db, currencyCode: string): Promise<Plan[]> {
  const { rows } = await db.query<Plan>(
    `select p.code, p.name, coalesce(pp.price_minor, 0)::int as "priceMinor", $1::text as "currencyCode",
            p.max_users as "maxUsers", p.max_projects as "maxProjects", p.features,
            p.name_en as "nameEn", p.tagline, p.tagline_en as "taglineEn", p.bullets, p.bullets_en as "bulletsEn", p.highlight
       from plan p left join plan_price pp on pp.plan_code = p.code and pp.currency_code = $1
      where p.public order by p.position`,
    [currencyCode],
  );
  return rows;
}

export interface PlanPrice { planCode: string; currencyCode: string; priceMinor: number; updatedAt: string }

export async function listPlanPrices(owner: Db): Promise<PlanPrice[]> {
  const { rows } = await owner.query<PlanPrice>(
    `select plan_code as "planCode", currency_code as "currencyCode", price_minor::int as "priceMinor", updated_at as "updatedAt"
       from plan_price order by currency_code, plan_code`);
  return rows;
}

/** Sets (or, with null, removes) a plan's price in a currency; the operator's gesture is journaled. */
export async function setPlanPrice(owner: Db, input: { planCode: string; currencyCode: string; priceMinor: number | null }, by: string): Promise<void> {
  const currency = input.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new DomainError('invalid_input', 400);
  if (input.priceMinor !== null && (!Number.isInteger(input.priceMinor) || input.priceMinor <= 0)) throw new DomainError('invalid_input', 400);
  const { rows } = await owner.query('select 1 from plan where code = $1 and public', [input.planCode]);
  if (!rows.length) throw new DomainError('not_found', 404);
  if (input.priceMinor === null) {
    await owner.query('delete from plan_price where plan_code = $1 and currency_code = $2', [input.planCode, currency]);
  } else {
    await owner.query(
      `insert into plan_price (plan_code, currency_code, price_minor) values ($1, $2, $3)
       on conflict (plan_code, currency_code) do update set price_minor = excluded.price_minor, updated_at = now()`,
      [input.planCode, currency, input.priceMinor]);
  }
  await owner.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)',
    [by, 'plan_price.set', input.planCode, JSON.stringify({ currencyCode: currency, priceMinor: input.priceMinor })]);
}

export interface Subscription {
  plan: Plan;
  trialEndsAt: string;
  trialExpired: boolean;
  /** End of the paid period (null: never paid). */
  paidUntil: string | null;
  /** A paying plan whose period is over: the company is asked to pay. */
  paymentDue: boolean;
  users: number;
  projects: number;
}

export async function getSubscription(db: Db, actor: Actor): Promise<Subscription> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.code, p.name, coalesce(pp.price_minor, 0)::int as "priceMinor", s.currency_code as "currencyCode",
              p.max_users as "maxUsers", p.max_projects as "maxProjects", p.features, s.trial_ends_at as "trialEndsAt",
              s.plan_code = 'trial' and s.trial_ends_at < now() as "trialExpired",
              s.paid_until as "paidUntil",
              p.price_minor > 0 and s.plan_code <> 'trial' and (s.paid_until is null or s.paid_until < now()) as "paymentDue",
              (select count(*)::int from member where "organizationId" = s.org_id) as users,
              (select count(*)::int from project where org_id = s.org_id and archived_at is null) as projects
         from org_settings s join plan p on p.code = s.plan_code
         left join plan_price pp on pp.plan_code = p.code and pp.currency_code = s.currency_code
        where s.org_id = $1`,
      [actor.orgId],
    );
    const row = rows[0] as Plan & {
      trialEndsAt: string; trialExpired: boolean; paidUntil: string | null; paymentDue: boolean; users: number; projects: number;
    };
    const { trialEndsAt, trialExpired, paidUntil, paymentDue, users, projects, ...plan } = row;
    return { plan, trialEndsAt, trialExpired, paidUntil, paymentDue, users, projects };
  });
}

/** Refuses a creation that would exceed the company's plan (users or active projects). */
export async function assertWithinLimit(tx: Tx, orgId: string, what: 'users' | 'projects'): Promise<void> {
  const { rows } = await tx.query<{ max: number | null; count: number; pending: number }>(
    what === 'users'
      ? `select p.max_users as max,
                (select count(*)::int from member where "organizationId" = $1) as count,
                (select count(*)::int from invitation where "organizationId" = $1 and status = 'pending'
                   and "expiresAt" > now()) as pending
           from org_settings s join plan p on p.code = s.plan_code where s.org_id = $1`
      : `select p.max_projects as max,
                (select count(*)::int from project where org_id = $1 and archived_at is null
                   and status <> 'done') as count, 0 as pending
           from org_settings s join plan p on p.code = s.plan_code where s.org_id = $1`,
    [orgId],
  );
  const row = rows[0];
  if (row && row.max !== null && row.count + row.pending >= row.max) {
    throw new DomainError(what === 'users' ? 'limit_users' : 'limit_projects', 409, { max: row.max });
  }
}

// ---------------------------------------------------------------- platform console (owner pool)

export interface CompanyOverview {
  orgId: string;
  name: string;
  createdAt: string;
  planCode: string;
  trialEndsAt: string;
  countryCode: string;
  users: number;
  projects: number;
  reportsLast30Days: number;
  isDemo: boolean; isInternal: boolean; paidUntil: string | null; suspended: boolean; ownerEmail: string | null; phone: string | null;
}

/** Every company, for the platform console. Owner connection only (it crosses companies). */
export async function platformOverview(owner: Db): Promise<CompanyOverview[]> {
  const { rows } = await owner.query<CompanyOverview>(
    `select o.id as "orgId", o.name, o."createdAt" as "createdAt", s.plan_code as "planCode",
            s.trial_ends_at as "trialEndsAt", s.country_code as "countryCode",
            (select count(*)::int from member m where m."organizationId" = o.id) as users,
            (select count(*)::int from project p where p.org_id = o.id and p.archived_at is null) as projects,
            (select count(*)::int from site_report r where r.org_id = o.id
               and r.created_at > now() - interval '30 days') as "reportsLast30Days",
            s.is_demo as "isDemo", s.is_internal as "isInternal", to_char(s.paid_until, 'YYYY-MM-DD') as "paidUntil", s.suspended_at is not null as suspended,
            (select u.email from member m join "user" u on u.id = m."userId" where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as "ownerEmail",
            (select i.phone from invoice_settings i where i.org_id = o.id) as phone
       from organization o join org_settings s on s.org_id = o.id
      where not exists (select 1 from demo_sandbox d where d.org_id = o.id)
      order by o."createdAt" desc`,
  );
  return rows;
}

/**
 * The platform's own figures (spec 027, owner connection): subscription revenue by month, the
 * recurring revenue of companies paid up today, trials ending within 7 days, and companies without
 * any field report for 14 days (at risk of leaving). Never a company's content.
 */
export async function platformRevenue(owner: Db) {
  const months = await owner.query<{ month: string; amount: number; payments: number }>(
    `with m as (select generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month')::date as month)
     select to_char(m.month, 'YYYY-MM') as month,
            coalesce((select sum(amount_minor) from subscription_payment s where s.status = 'succeeded' and date_trunc('month', s.paid_at) = m.month), 0)::bigint as amount,
            coalesce((select count(*) from subscription_payment s where s.status = 'succeeded' and date_trunc('month', s.paid_at) = m.month), 0)::int as payments
       from m order by m.month`,
  );
  const summary = await owner.query<{ mrr: number; paying: number; trials: number; trialsEnding: number; companies: number }>(
    `select coalesce(sum(p.price_minor) filter (where s.paid_until > now()), 0)::bigint as mrr,
            count(*) filter (where s.paid_until > now())::int as paying,
            count(*) filter (where s.plan_code = 'trial' and s.trial_ends_at > now())::int as trials,
            count(*) filter (where s.plan_code = 'trial' and s.trial_ends_at between now() and now() + interval '7 days')::int as "trialsEnding",
            count(*)::int as companies
       from org_settings s join plan p on p.code = s.plan_code`,
  );
  const quiet = await owner.query<{ orgId: string; name: string; lastReport: string | null }>(
    `select o.id as "orgId", o.name, (select max(r.created_at) from site_report r where r.org_id = o.id) as "lastReport"
       from organization o
      where not exists (select 1 from site_report r where r.org_id = o.id and r.created_at > now() - interval '14 days')
      order by o."createdAt" desc limit 20`,
  );
  const row = summary.rows[0]!;
  return {
    months: months.rows.map((item) => ({ ...item, amount: Number(item.amount) })),
    mrrMinor: Number(row.mrr), paying: row.paying, trials: row.trials, trialsEnding: row.trialsEnding, companies: row.companies,
    quiet: quiet.rows,
  };
}

export async function setCompanyPlan(owner: Db, orgId: string, planCode: string, by: string): Promise<void> {
  const { rowCount } = await owner.query('update org_settings set plan_code = $2 where org_id = $1 and exists (select 1 from plan where code = $2)', [orgId, planCode]);
  if (!rowCount) throw new DomainError('not_found', 404);
  await owner.query(
    `insert into journal (org_id, command, target, after, actor, door) values ($1, 'plan.set', $1, $2, $3, 'system')`,
    [orgId, JSON.stringify({ planCode }), by],
  );
}

/**
 * Product health (spec 041, owner connection): is the product used? Real companies only (demo
 * companies excluded). The north-star figure is validated field reports per week; activation is a
 * first field report within 48 hours of sign-up; usage is reports per active site lead.
 */
export async function productHealth(owner: Db) {
  const weeks = await owner.query<{ week: string; reports: number; validated: number; leads: number; companies: number }>(
    `with w as (select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as week)
     select to_char(w.week, 'YYYY-MM-DD') as week,
            count(r.id)::int as reports,
            count(r.id) filter (where r.status = 'validated')::int as validated,
            count(distinct r.author_id)::int as leads,
            count(distinct r.org_id)::int as companies
       from w left join site_report r on r.created_at >= w.week and r.created_at < w.week + interval '1 week'
             and r.org_id in (select org_id from org_settings where not is_demo and not is_internal)
      group by w.week order by w.week`,
  );
  const cohort = await owner.query<{ orgId: string; createdAt: string; firstReport: string | null; firstInvoice: string | null; hasLead: boolean; invitedClient: boolean; week4: boolean; ageDays: number }>(
    `select o.id as "orgId", o."createdAt" as "createdAt",
            (select min(r.created_at) from site_report r where r.org_id = o.id) as "firstReport",
            (select min(i.created_at) from invoice i where i.org_id = o.id) as "firstInvoice",
            exists (select 1 from member m where m."organizationId" = o.id and m.role = 'site_lead') as "hasLead",
            exists (select 1 from portal_link l where l.org_id = o.id) as "invitedClient",
            exists (select 1 from site_report r where r.org_id = o.id and r.created_at between o."createdAt" + interval '21 days' and o."createdAt" + interval '28 days') as week4,
            extract(day from now() - o."createdAt")::int as "ageDays"
       from organization o join org_settings s on s.org_id = o.id
      where not s.is_demo and not s.is_internal and o."createdAt" > now() - interval '90 days'`,
  );
  const now = await owner.query<{ leads7: number; reports7: number; activeSites: number; sitesReported: number; trialsOver: number; converted: number; companies: number }>(
    `select (select count(distinct r.author_id) from site_report r join org_settings s on s.org_id = r.org_id where not s.is_demo and not s.is_internal and r.created_at > now() - interval '7 days')::int as leads7,
            (select count(*) from site_report r join org_settings s on s.org_id = r.org_id where not s.is_demo and not s.is_internal and r.created_at > now() - interval '7 days')::int as reports7,
            (select count(*) from project p join org_settings s on s.org_id = p.org_id where not s.is_demo and p.status = 'active' and p.archived_at is null)::int as "activeSites",
            (select count(*) from project p join org_settings s on s.org_id = p.org_id where not s.is_demo and p.status = 'active' and p.archived_at is null
               and exists (select 1 from site_report r where r.project_id = p.id and r.created_at > now() - interval '7 days'))::int as "sitesReported",
            (select count(*) from org_settings s where not s.is_demo and s.trial_ends_at < now())::int as "trialsOver",
            (select count(*) from org_settings s where not s.is_demo and s.trial_ends_at < now() and s.paid_until is not null)::int as converted,
            (select count(*) from org_settings s where not s.is_demo)::int as companies`,
  );
  const rows = cohort.rows;
  const hours = (from: string, to: string | null) => (to ? (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000 : null);
  const toFirst = rows.map((row) => hours(row.createdAt, row.firstReport)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const pct = (part: number, whole: number) => (whole ? Math.round((part * 100) / whole) : null);
  const old28 = rows.filter((row) => row.ageDays >= 28);
  const n = now.rows[0]!;
  return {
    weeks: weeks.rows,
    signups30: rows.filter((row) => row.ageDays <= 30).length,
    cohortSize: rows.length,
    activation: {
      firstReport48hPct: pct(rows.filter((row) => { const h = hours(row.createdAt, row.firstReport); return h !== null && h <= 48; }).length, rows.length),
      medianHoursToFirstReport: toFirst.length ? Math.round(toFirst[Math.floor(toFirst.length / 2)]!) : null,
      invitedLeadPct: pct(rows.filter((row) => row.hasLead).length, rows.length),
      firstInvoicePct: pct(rows.filter((row) => row.firstInvoice).length, rows.length),
      invitedClientPct: pct(rows.filter((row) => row.invitedClient).length, rows.length),
    },
    usage: {
      activeLeads7: n.leads7,
      reportsPerLead7: n.leads7 ? Math.round((n.reports7 / n.leads7) * 10) / 10 : null,
      sitesReportedPct: pct(n.sitesReported, n.activeSites),
      activeSites: n.activeSites,
    },
    retention: { week4Pct: pct(old28.filter((row) => row.week4).length, old28.length), base: old28.length },
    conversion: { trialToPaidPct: pct(n.converted, n.trialsOver), trialsOver: n.trialsOver, companies: n.companies },
  };
}
