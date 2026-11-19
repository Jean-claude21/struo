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
}

const PLAN_COLUMNS = `code, name, price_minor as "priceMinor", currency_code as "currencyCode",
  max_users as "maxUsers", max_projects as "maxProjects", features`;

export async function listPlans(db: Db): Promise<Plan[]> {
  const { rows } = await db.query<Plan>(`select ${PLAN_COLUMNS} from plan where public order by position`);
  return rows;
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
      `select p.code, p.name, p.price_minor as "priceMinor", p.currency_code as "currencyCode",
              p.max_users as "maxUsers", p.max_projects as "maxProjects", p.features, s.trial_ends_at as "trialEndsAt",
              s.plan_code = 'trial' and s.trial_ends_at < now() as "trialExpired",
              s.paid_until as "paidUntil",
              p.price_minor > 0 and s.plan_code <> 'trial' and (s.paid_until is null or s.paid_until < now()) as "paymentDue",
              (select count(*)::int from member where "organizationId" = s.org_id) as users,
              (select count(*)::int from project where org_id = s.org_id and archived_at is null) as projects
         from org_settings s join plan p on p.code = s.plan_code where s.org_id = $1`,
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
}

/** Every company, for the platform console. Owner connection only (it crosses companies). */
export async function platformOverview(owner: Db): Promise<CompanyOverview[]> {
  const { rows } = await owner.query<CompanyOverview>(
    `select o.id as "orgId", o.name, o."createdAt" as "createdAt", s.plan_code as "planCode",
            s.trial_ends_at as "trialEndsAt", s.country_code as "countryCode",
            (select count(*)::int from member m where m."organizationId" = o.id) as users,
            (select count(*)::int from project p where p.org_id = o.id and p.archived_at is null) as projects,
            (select count(*)::int from site_report r where r.org_id = o.id
               and r.created_at > now() - interval '30 days') as "reportsLast30Days"
       from organization o join org_settings s on s.org_id = o.id order by o."createdAt" desc`,
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
