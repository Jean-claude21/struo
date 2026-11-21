import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { readSettings } from './invoicing.ts';
import { hashToken } from './portal.ts';

/**
 * Spec 049: the client report. Built only from what is recorded — validated progress, photos of
 * validated reports, milestones reached and coming, change orders — in the company's own look.
 * Costs, expenses and margins are never read here.
 */

type Query = Pick<Tx, 'query'>;

export interface ClientReport {
  period: { from: string; to: string };
  company: { name: string; logoKey: string | null; accentColor: string | null; font: 'sans' | 'serif'; address: string | null; phone: string | null; email: string | null };
  project: { id: string; code: string; name: string; location: string | null; clientName: string | null; progressPct: number; endDate: string | null };
  intro: string | null;
  note: string | null;
  phases: { name: string; progressPct: number }[] | null;
  photos: { id: string; takenAt: string; phase: string | null }[];
  reportsCount: number;
  reached: { name: string; actualOn: string }[] | null;
  upcoming: { name: string; plannedOn: string }[] | null;
  changes: { number: number; title: string; amountMinor: number; status: string }[] | null;
  currency: string;
}

async function build(q: Query, orgId: string, projectId: string, from: string, to: string, note: string | null): Promise<ClientReport> {
  const settings = await readSettings(q as Tx, orgId);
  const project = (await q.query<{ id: string; code: string; name: string; location: string | null; clientName: string | null; progressPct: number; endDate: string | null; currency: string; company: string }>(
    `select p.id, p.code, p.name, p.location, c.name as "clientName", pp.progress_pct as "progressPct", to_char(p.end_date, 'YYYY-MM-DD') as "endDate",
            p.currency_code as currency, o.name as company
       from project p join project_progress pp on pp.project_id = p.id join organization o on o.id = p.org_id left join client c on c.id = p.client_id
      where p.id = $1 and p.org_id = $2`, [projectId, orgId])).rows[0];
  if (!project) throw notFound();
  const [phases, photos, reports, reached, upcoming, changes] = await Promise.all([
    settings.reportShowProgress
      ? q.query<{ name: string; progressPct: number }>('select name, progress_pct as "progressPct" from project_phase where project_id = $1 order by position, name', [projectId])
      : null,
    settings.reportPhotos
      ? q.query<{ id: string; takenAt: string; phase: string | null }>(
        `select ph.id, to_char(ph.taken_at, 'YYYY-MM-DD') as "takenAt", x.name as phase from report_photo ph join site_report r on r.id = ph.report_id
           left join project_phase x on x.id = r.phase_id
          where r.project_id = $1 and r.org_id = $2 and r.status = 'validated' and ph.shared_with_client and r.taken_at::date between $3 and $4
          order by ph.taken_at desc limit $5`, [projectId, orgId, from, to, settings.reportPhotos])
      : null,
    q.query<{ n: number }>(`select count(*)::int as n from site_report where project_id = $1 and org_id = $2 and status = 'validated' and taken_at::date between $3 and $4`, [projectId, orgId, from, to]),
    settings.reportShowMilestones
      ? q.query<{ name: string; actualOn: string }>(`select name, to_char(actual_on, 'YYYY-MM-DD') as "actualOn" from milestone where project_id = $1 and org_id = $2 and actual_on between $3 and $4 order by actual_on`, [projectId, orgId, from, to])
      : null,
    settings.reportShowMilestones
      ? q.query<{ name: string; plannedOn: string }>(`select name, to_char(planned_on, 'YYYY-MM-DD') as "plannedOn" from milestone where project_id = $1 and org_id = $2 and actual_on is null order by planned_on limit 3`, [projectId, orgId])
      : null,
    settings.reportShowChanges
      ? q.query<{ number: number; title: string; amountMinor: number; status: string }>(
        `select number, title, amount_minor::float8 as "amountMinor", status from change_order where project_id = $1 and org_id = $2 and status <> 'draft' order by number`, [projectId, orgId])
      : null,
  ]);
  return {
    period: { from, to },
    company: { name: project.company, logoKey: settings.logoKey, accentColor: settings.accentColor, font: settings.font, address: settings.address, phone: settings.phone, email: settings.email },
    project: { id: project.id, code: project.code, name: project.name, location: project.location, clientName: project.clientName, progressPct: project.progressPct, endDate: project.endDate },
    intro: settings.reportIntro, note,
    phases: phases?.rows ?? null, photos: photos?.rows ?? [], reportsCount: reports.rows[0]?.n ?? 0,
    reached: reached?.rows ?? null, upcoming: upcoming?.rows ?? null, changes: changes?.rows ?? null, currency: project.currency,
  };
}

const period = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) });

/** The office's preview of a report for a period (or the saved report, with its note). */
export async function clientReport(db: Db, actor: Actor, projectId: string, input: unknown, note: string | null = null): Promise<ClientReport> {
  const data = parse(period, input);
  if (data.to < data.from) throw new DomainError('invalid_input', 422, { field: 'to', detail: '' });
  return asActor(db, actor, (tx) => build(tx, actor.orgId, projectId, data.from, data.to, note));
}

export interface ClientReportRow { id: string; from: string; to: string; note: string | null; sentTo: string | null; sentAt: string | null; automatic: boolean; createdAt: string }

export async function listClientReports(db: Db, actor: Actor, projectId: string): Promise<ClientReportRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ClientReportRow>(
      `select id, to_char(period_from, 'YYYY-MM-DD') as "from", to_char(period_to, 'YYYY-MM-DD') as "to", note, sent_to as "sentTo", sent_at as "sentAt", automatic, created_at as "createdAt"
         from client_report where org_id = $1 and project_id = $2 order by created_at desc limit 50`, [actor.orgId, projectId]);
    return rows;
  });
}

/** Keeps a report that is sent (or about to be) to the client, with its period and note. */
export async function saveClientReport(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  if (!['owner', 'admin', 'engineer'].includes(actor.role)) throw new DomainError('forbidden', 403);
  const data = parse(period.extend({ projectId: z.string().uuid(), note: z.string().trim().max(2000).nullable().optional(), sentTo: z.string().trim().max(254).nullable().optional() }), input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      `insert into client_report (org_id, project_id, period_from, period_to, note, sent_to, sent_at, created_by)
       values ($1, $2, $3, $4, $5, $6, case when $6::text is null then null else now() end, $7) returning id`,
      [actor.orgId, data.projectId, data.from, data.to, data.note || null, data.sentTo || null, actor.userId]);
    await journal(tx, actor, 'client_report.send', rows[0]!.id, null, { projectId: data.projectId, from: data.from, to: data.to, sentTo: data.sentTo ? 'set' : null });
    return { id: rows[0]!.id };
  });
}

// ---------------------------------------------------------------- the client's link

export interface PortalContact { linkId: string; contactName: string | null; contactEmail: string | null; tokenEnc: string | null; showPhotos: boolean; showFinance: boolean }

/** The active link of a site's client (the last one not revoked). */
export async function portalContact(db: Db, actor: Actor, projectId: string): Promise<PortalContact | null> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<PortalContact>(
      `select id as "linkId", contact_name as "contactName", contact_email as "contactEmail", token_enc as "tokenEnc", show_photos as "showPhotos", show_finance as "showFinance"
         from portal_link where org_id = $1 and project_id = $2 and revoked_at is null order by created_at desc limit 1`, [actor.orgId, projectId]);
    return rows[0] ?? null;
  });
}

/** Keeps the link's token sealed by the application, so later messages can carry it. */
export async function sealPortalToken(db: Db, actor: Actor, linkId: string, sealed: string): Promise<void> {
  ensure(actor, 'portal.manage');
  await asActor(db, actor, async (tx) => {
    await tx.query('update portal_link set token_enc = $3 where id = $1 and org_id = $2', [linkId, actor.orgId, sealed]);
  });
}

// ---------------------------------------------------------------- the client's side (platform connection)

/** The reports sent on the link's site, newest first (owner connection, keyed by the token). */
export async function portalClientReports(owner: Db, token: string): Promise<{ id: string; from: string; to: string; sentAt: string }[]> {
  const { rows } = await owner.query<{ id: string; from: string; to: string; sentAt: string }>(
    `select r.id, to_char(r.period_from, 'YYYY-MM-DD') as "from", to_char(r.period_to, 'YYYY-MM-DD') as "to", r.sent_at as "sentAt"
       from portal_link l join client_report r on r.project_id = l.project_id and r.org_id = l.org_id
      where l.token_hash = $1 and l.revoked_at is null and r.sent_at is not null order by r.sent_at desc limit 30`, [hashToken(token)]);
  return rows;
}

export async function portalClientReport(owner: Db, token: string, reportId: string): Promise<ClientReport | null> {
  const { rows } = await owner.query<{ orgId: string; projectId: string; from: string; to: string; note: string | null; showPhotos: boolean }>(
    `select l.org_id as "orgId", l.project_id as "projectId", to_char(r.period_from, 'YYYY-MM-DD') as "from", to_char(r.period_to, 'YYYY-MM-DD') as "to", r.note, l.show_photos as "showPhotos"
       from portal_link l join client_report r on r.project_id = l.project_id and r.org_id = l.org_id
      where l.token_hash = $1 and l.revoked_at is null and r.id = $2 and r.sent_at is not null`, [hashToken(token), reportId]);
  const link = rows[0];
  if (!link) return null;
  const report = await build(owner as unknown as Query, link.orgId, link.projectId, link.from, link.to, link.note);
  return link.showPhotos ? report : { ...report, photos: [] };
}

/** Sites whose company sends the report every week, with the client's address and sealed link. */
export async function weeklyReportTargets(owner: Db) {
  const { rows } = await owner.query<{ orgId: string; projectId: string; projectName: string; company: string; locale: 'fr' | 'en'; timeZone: string; ownerId: string; email: string; contactName: string | null; tokenEnc: string | null }>(
    `select p.org_id as "orgId", p.id as "projectId", p.name as "projectName", o.name as company, s.locale, s.time_zone as "timeZone",
            (select m."userId" from member m where m."organizationId" = p.org_id and m.role = 'owner' limit 1) as "ownerId",
            l.contact_email as email, l.contact_name as "contactName", l.token_enc as "tokenEnc"
       from project p join organization o on o.id = p.org_id join org_settings s on s.org_id = p.org_id
       join invoice_settings i on i.org_id = p.org_id and i.report_weekly
       join lateral (select * from portal_link x where x.project_id = p.id and x.revoked_at is null and x.contact_email is not null order by x.created_at desc limit 1) l on true
      where p.status = 'active' and p.archived_at is null and not s.is_demo`);
  return rows;
}

/** Records a report sent by the weekly job (no person acting: platform connection). */
export async function saveAutomaticClientReport(owner: Db, input: { orgId: string; projectId: string; from: string; to: string; sentTo: string }): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `insert into client_report (org_id, project_id, period_from, period_to, sent_to, sent_at, automatic) values ($1, $2, $3, $4, $5, now(), true) returning id`,
    [input.orgId, input.projectId, input.from, input.to, input.sentTo]);
  return rows[0]!.id;
}
