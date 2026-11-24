import { asActor } from './access.ts';
import { asUser, type Actor, type Db } from './db.ts';

export interface Alert {
  kind:
    | 'invoice_overdue'
    | 'document_expired'
    | 'document_expiring'
    | 'document_to_fix'
    | 'milestone_late'
    | 'collection_gap'
    | 'incident_open'
    | 'reports_to_review'
    | 'task_late';
  severity: 'critical' | 'important' | 'info';
  projectId: string | null;
  target: string;
  params: Record<string, string | number | null>;
}

const SEVERITY_ORDER = { critical: 0, important: 1, info: 2 } as const;

/** Every alert of the company today, most severe first (rules in SQL: struo_alerts). */
export async function listAlerts(db: Db, actor: Pick<Actor, 'userId' | 'orgId'>): Promise<Alert[]> {
  return asUser(db, actor.userId, async (tx) => {
    const { rows } = await tx.query<Alert & { sort_key: number; project_id: string | null }>(
      'select kind, severity, project_id, target, params, sort_key from struo_alerts($1)',
      [actor.orgId],
    );
    // Spec 048: tasks past their due date, with who has them.
    const tasks = await tx.query<Alert & { sort_key: number; project_id: string | null }>(
      `select 'task_late' as kind, case when t.priority = 'urgent' then 'critical' else 'important' end as severity,
              t.project_id, t.id::text as target, (current_date - t.due_on)::int as sort_key,
              jsonb_build_object('project', p.code, 'title', t.title, 'assignee', coalesce(u.name, '—'), 'days', current_date - t.due_on) as params
         from project_task t join project p on p.id = t.project_id left join "user" u on u.id = t.assignee_id
        where t.org_id = $1 and t.status <> 'done' and t.due_on < current_date and p.archived_at is null`,
      [actor.orgId],
    );
    return [...rows, ...tasks.rows]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.sort_key - a.sort_key)
      .map((row) => ({ kind: row.kind, severity: row.severity, projectId: row.project_id, target: row.target, params: row.params }));
  });
}

/** Operational and quality indicators of the dashboard. */
export async function operationsSummary(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select
         (select count(*)::int from project where org_id = $1 and archived_at is null and status = 'active') as "activeProjects",
         (select json_object_agg(status, n) from (select status, count(*)::int as n from project
            where org_id = $1 and archived_at is null group by status) s) as "byStatus",
         (select coalesce(round(avg(pp.progress_pct))::int, 0) from project_progress pp join project p on p.id = pp.project_id
           where p.org_id = $1 and p.archived_at is null and p.status = 'active') as "averageProgress",
         (select count(*)::int from milestone m where m.org_id = $1) as "milestonesTotal",
         (select count(*)::int from milestone m where m.org_id = $1 and m.actual_on is not null) as "milestonesDone",
         (select coalesce(round(avg(ms.delay_days) filter (where ms.status = 'late'))::int, 0) from milestone_status ms
           where ms.org_id = $1) as "averageDelay",
         (select case when count(*) filter (where ds.required) = 0 then null
                      else round(100.0 * count(*) filter (where ds.required and ds.status = 'valid')
                                 / count(*) filter (where ds.required))::int end
            from document_status ds join project p on p.id = ds.project_id
           where ds.org_id = $1 and p.archived_at is null and p.status <> 'done') as "compliancePct",
         (select count(*)::int from site_report where org_id = $1 and taken_at > now() - interval '7 days') as "reportsWeek",
         (select count(*)::int from report_photo where org_id = $1 and taken_at > now() - interval '7 days') as "photosWeek",
         (select count(*)::int from incident where org_id = $1 and status = 'open') as "openIncidents",
         (select count(*)::int from site_report where org_id = $1 and status = 'submitted') as "reportsToReview"`,
      [actor.orgId],
    );
    return rows[0] as {
      activeProjects: number; byStatus: Record<string, number> | null; averageProgress: number; milestonesTotal: number;
      milestonesDone: number; averageDelay: number; compliancePct: number | null; reportsWeek: number; photosWeek: number;
      openIncidents: number; reportsToReview: number;
    };
  });
}

/** The last entries of the journal, for « who did what ». */
export async function recentActivity(db: Db, actor: Actor, limit = 30) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select j.id, j.at, j.command, j.target, j.door, coalesce(u.name, j.actor) as "actorName"
         from journal j left join "user" u on u.id = j.actor
        where j.org_id = $1 order by j.id desc limit $2`,
      [actor.orgId, Math.min(limit, 200)],
    );
    return rows as { id: number; at: string; command: string; target: string; door: string; actorName: string }[];
  });
}

/**
 * Companies to brief today and who receives the brief (owners and admins), read with the owner
 * connection by the scheduled job. Then each company's alerts are read as one of its owners.
 */
export async function digestRecipients(owner: Db) {
  const { rows } = await owner.query<{ orgId: string; orgName: string; locale: 'fr' | 'en'; timeZone: string; ownerId: string; emails: string[] }>(
    `select o.id as "orgId", o.name as "orgName", s.locale, s.time_zone as "timeZone",
            (select m."userId" from member m where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as "ownerId",
            array(select u.email from member m join "user" u on u.id = m."userId"
                   where m."organizationId" = o.id and m.role in ('owner', 'admin')) as emails
       from organization o join org_settings s on s.org_id = o.id
      where not exists (select 1 from notification_log n where n.org_id = o.id and n.kind = 'digest' and n.day = current_date)`,
  );
  return rows.filter((row) => row.ownerId);
}

/** Every active company with its owner and the e-mails of its owners and admins, for the periodic reports (spec 039). */
export async function reportRecipients(owner: Db) {
  const { rows } = await owner.query<{ orgId: string; orgName: string; locale: 'fr' | 'en'; timeZone: string; ownerId: string; emails: string[] }>(
    `select o.id as "orgId", o.name as "orgName", s.locale, s.time_zone as "timeZone",
            (select m."userId" from member m where m."organizationId" = o.id and m.role = 'owner' order by m."createdAt" limit 1) as "ownerId",
            array(select u.email from member m join "user" u on u.id = m."userId"
                   where m."organizationId" = o.id and m.role in ('owner', 'admin')) as emails
       from organization o join org_settings s on s.org_id = o.id
      where s.suspended_at is null`,
  );
  return rows.filter((row) => row.ownerId && row.emails.length);
}

/** Marks a notification as sent today; false when it was already (never twice the same day). */
export async function markNotified(owner: Db, orgId: string, kind: string, target: string, channel: string): Promise<boolean> {
  const { rowCount } = await owner.query(
    `insert into notification_log (org_id, kind, target, channel) values ($1, $2, $3, $4) on conflict do nothing`,
    [orgId, kind, target, channel],
  );
  return rowCount === 1;
}
