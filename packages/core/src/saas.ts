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
  users: number;
  projects: number;
}

export async function getSubscription(db: Db, actor: Actor): Promise<Subscription> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.code, p.name, p.price_minor as "priceMinor", p.currency_code as "currencyCode",
              p.max_users as "maxUsers", p.max_projects as "maxProjects", p.features, s.trial_ends_at as "trialEndsAt",
              s.plan_code = 'trial' and s.trial_ends_at < now() as "trialExpired",
              (select count(*)::int from member where "organizationId" = s.org_id) as users,
              (select count(*)::int from project where org_id = s.org_id and archived_at is null) as projects
         from org_settings s join plan p on p.code = s.plan_code where s.org_id = $1`,
      [actor.orgId],
    );
    const row = rows[0] as Plan & { trialEndsAt: string; trialExpired: boolean; users: number; projects: number };
    const { trialEndsAt, trialExpired, users, projects, ...plan } = row;
    return { plan, trialEndsAt, trialExpired, users, projects };
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

export async function setCompanyPlan(owner: Db, orgId: string, planCode: string, by: string): Promise<void> {
  const { rowCount } = await owner.query('update org_settings set plan_code = $2 where org_id = $1 and exists (select 1 from plan where code = $2)', [orgId, planCode]);
  if (!rowCount) throw new DomainError('not_found', 404);
  await owner.query(
    `insert into journal (org_id, command, target, after, actor, door) values ($1, 'plan.set', $1, $2, $3, 'system')`,
    [orgId, JSON.stringify({ planCode }), by],
  );
}
