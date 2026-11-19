import { asActor } from './access.ts';
import type { Actor, Db } from './db.ts';

/**
 * What the « Today » pages show (spec 023): cash over the last months, the photos of the day, each
 * open site with its cover photo and phases, what clients did in their space, and a risk score per
 * client computed from facts only (overdue days, overdue share, progress ahead of payments).
 */
export async function dashboardInsights(db: Db, actor: Actor, months = 6) {
  return asActor(db, actor, async (tx) => {
    const cash = await tx.query<{ month: string; invoiced: number; collected: number }>(
      `with m as (select generate_series(date_trunc('month', current_date) - make_interval(months => $2 - 1), date_trunc('month', current_date), interval '1 month')::date as month)
       select to_char(m.month, 'YYYY-MM') as month,
              coalesce((select sum(i.net_minor) from invoice i where i.org_id = $1 and i.status = 'issued' and date_trunc('month', i.issued_on) = m.month), 0)::bigint as invoiced,
              coalesce((select sum(p.amount_minor) from payment p where p.org_id = $1 and date_trunc('month', p.received_on) = m.month), 0)::bigint as collected
         from m order by m.month`,
      [actor.orgId, months],
    );
    const photos = await tx.query<{ id: string; projectId: string; projectCode: string; takenAt: string; author: string }>(
      `select ph.id, r.project_id as "projectId", p.code as "projectCode", ph.taken_at as "takenAt", u.name as author
         from report_photo ph join site_report r on r.id = ph.report_id join project p on p.id = r.project_id join "user" u on u.id = r.author_id
        where ph.org_id = $1 and p.archived_at is null order by ph.taken_at desc limit 12`,
      [actor.orgId],
    );
    const sites = await tx.query<{
      id: string; code: string; name: string; status: string; progressPct: number; collectedPct: number; health: string; coverId: string | null;
      latitude: number | null; longitude: number | null; location: string | null; phases: { name: string; progress: number }[];
    }>(
      `select p.id, p.code, p.name, p.status, f.progress_pct as "progressPct", f.collected_pct as "collectedPct", f.health,
              p.latitude, p.longitude, p.location,
              (select ph.id from report_photo ph join site_report r on r.id = ph.report_id where r.project_id = p.id order by ph.taken_at desc limit 1) as "coverId",
              coalesce((select json_agg(json_build_object('name', x.name, 'progress', x.progress_pct) order by x.position) from project_phase x where x.project_id = p.id), '[]') as phases
         from project p join project_finance f on f.project_id = p.id
        where p.org_id = $1 and p.archived_at is null
        order by case p.status when 'active' then 0 when 'suspended' then 1 when 'pending' then 2 else 3 end, p.code`,
      [actor.orgId],
    );
    const clientActivity = await tx.query<{ at: string; command: string; projectId: string | null; projectName: string | null; clientName: string | null }>(
      `select j.at, j.command, p.id as "projectId", p.name as "projectName", coalesce(l.contact_name, c.name) as "clientName"
         from journal j
         left join portal_link l on j.actor = 'portal:' || l.id::text
         left join project p on p.id = l.project_id
         left join client c on c.id = p.client_id
        where j.org_id = $1 and j.door = 'portal' order by j.id desc limit 12`,
      [actor.orgId],
    );
    const risk = await tx.query<{ clientId: string; clientName: string; score: number; overdueMinor: number; maxOverdueDays: number; gap: number }>(
      `with per_client as (
         select c.id as client_id, c.name,
                coalesce(sum(f.overdue_minor), 0) as overdue,
                coalesce(sum(f.invoiced_net_minor), 0) as invoiced,
                coalesce(max(b.max_days), 0) as max_days,
                coalesce(max(greatest(f.progress_pct - f.collected_pct, 0)), 0) as gap
           from client c join project p on p.client_id = c.id join project_finance f on f.project_id = p.id
           left join lateral (select max(ib.overdue_days) as max_days from invoice_balance ib where ib.project_id = p.id and ib.balance_minor > 0) b on true
          where c.org_id = $1 and p.archived_at is null group by c.id, c.name)
       select client_id as "clientId", name as "clientName", overdue::bigint as "overdueMinor", max_days::int as "maxOverdueDays", gap::int as gap,
              least(100, round(
                (case when overdue > 0 then 30 else 0 end)
                + least(30, max_days / 3.0)
                + (case when invoiced > 0 then least(20, 40.0 * overdue / invoiced) else 0 end)
                + least(20, gap / 2.0)))::int as score
         from per_client order by score desc`,
      [actor.orgId],
    );
    return {
      cash: cash.rows.map((row) => ({ ...row, invoiced: Number(row.invoiced), collected: Number(row.collected) })),
      photos: photos.rows,
      sites: sites.rows,
      clientActivity: clientActivity.rows,
      risk: risk.rows.map((row) => ({ ...row, overdueMinor: Number(row.overdueMinor) })),
    };
  });
}

/** The latest photo of each site (its cover in lists). */
export async function projectCovers(db: Db, actor: Actor): Promise<Record<string, string>> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ project_id: string; id: string }>(
      `select distinct on (r.project_id) r.project_id, ph.id from report_photo ph join site_report r on r.id = ph.report_id
        where ph.org_id = $1 order by r.project_id, ph.taken_at desc`,
      [actor.orgId],
    );
    return Object.fromEntries(rows.map((row) => [row.project_id, row.id]));
  });
}

/** Each member's last recorded action in the company (team page). */
export async function memberActivity(db: Db, actor: Actor): Promise<Map<string, string>> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ actor: string; at: string }>('select actor, max(at) as at from journal where org_id = $1 group by actor', [actor.orgId]);
    return new Map(rows.map((row) => [row.actor, new Date(row.at).toISOString()]));
  });
}
