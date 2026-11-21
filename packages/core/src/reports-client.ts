import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { readSettings } from './invoicing.ts';
import { hashToken } from './portal.ts';

/**
 * Specs 049–050: the client report. Built only from what is recorded — validated progress, chosen
 * photos of validated reports, milestones reached and coming, change orders, what waits for the
 * client — in the company's own look. Costs, expenses and margins are never read here.
 *
 * A report is first a draft: sections of prose (written by the office or an assistant from the
 * facts), chosen photos and a note. Once sent it is frozen: the client sees what was validated.
 * Figures always come from the records; the prose only tells them.
 */

type Query = Pick<Tx, 'query'>;

export const REPORT_SECTIONS = ['summary', 'done', 'next', 'ask'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export type ReportSections = Partial<Record<ReportSection, string | null>>;

export interface ClientReport {
  id: string | null;
  status: 'preview' | 'draft' | 'sent';
  period: { from: string; to: string };
  company: { name: string; logoKey: string | null; accentColor: string | null; font: 'sans' | 'serif'; address: string | null; phone: string | null; email: string | null };
  project: { id: string; code: string; name: string; location: string | null; clientName: string | null; progressPct: number; endDate: string | null };
  intro: string | null;
  note: string | null;
  sections: ReportSections;
  phases: { name: string; progressPct: number }[] | null;
  photos: { id: string; takenAt: string; phase: string | null }[];
  reportsCount: number;
  reached: { name: string; actualOn: string }[] | null;
  upcoming: { name: string; plannedOn: string }[] | null;
  changes: { number: number; title: string; amountMinor: number; status: string }[] | null;
  asks: { kind: 'change' | 'milestone'; label: string }[];
  currency: string;
}

/** What an assistant (or the plain template) may write the prose from. Nothing else. */
export interface ReportFacts {
  company: string;
  project: { name: string; code: string; progressPct: number; endDate: string | null; clientName: string | null };
  period: { from: string; to: string };
  reportsCount: number;
  notes: { date: string; phase: string | null; text: string }[];
  phases: { name: string; progressPct: number }[];
  reached: { name: string; actualOn: string }[];
  upcoming: { name: string; plannedOn: string }[];
  asks: { kind: 'change' | 'milestone'; label: string }[];
}

interface BuildOptions { id?: string | null; status?: ClientReport['status']; sections?: ReportSections; photoIds?: string[] | null }

async function projectRow(q: Query, orgId: string, projectId: string) {
  const project = (await q.query<{ id: string; code: string; name: string; location: string | null; clientName: string | null; progressPct: number; endDate: string | null; currency: string; company: string }>(
    `select p.id, p.code, p.name, p.location, c.name as "clientName", pp.progress_pct as "progressPct", to_char(p.end_date, 'YYYY-MM-DD') as "endDate",
            p.currency_code as currency, o.name as company
       from project p join project_progress pp on pp.project_id = p.id join organization o on o.id = p.org_id left join client c on c.id = p.client_id
      where p.id = $1 and p.org_id = $2`, [projectId, orgId])).rows[0];
  if (!project) throw notFound();
  return project;
}

async function asksOf(q: Query, orgId: string, projectId: string): Promise<ClientReport['asks']> {
  const [changes, milestones] = await Promise.all([
    q.query<{ label: string }>(`select 'n° ' || number || ' · ' || title as label from change_order where project_id = $1 and org_id = $2 and status = 'sent' order by number`, [projectId, orgId]),
    q.query<{ label: string }>(`select name as label from milestone where project_id = $1 and org_id = $2 and client_validation and actual_on is not null and client_validated_at is null order by actual_on`, [projectId, orgId]),
  ]);
  return [...changes.rows.map((row) => ({ kind: 'change' as const, label: row.label })), ...milestones.rows.map((row) => ({ kind: 'milestone' as const, label: row.label }))];
}

/** The validated, shared photos of a period, newest first: what the office may choose from. */
async function candidatePhotos(q: Query, orgId: string, projectId: string, from: string, to: string, limit = 60) {
  const { rows } = await q.query<{ id: string; takenAt: string; phase: string | null }>(
    `select ph.id, to_char(ph.taken_at, 'YYYY-MM-DD') as "takenAt", x.name as phase from report_photo ph join site_report r on r.id = ph.report_id
       left join project_phase x on x.id = r.phase_id
      where r.project_id = $1 and r.org_id = $2 and r.status = 'validated' and ph.shared_with_client and r.taken_at::date between $3 and $4
      order by ph.taken_at desc limit $5`, [projectId, orgId, from, to, limit]);
  return rows;
}

async function build(q: Query, orgId: string, projectId: string, from: string, to: string, note: string | null, options: BuildOptions = {}): Promise<ClientReport> {
  const settings = await readSettings(q as Tx, orgId);
  const project = await projectRow(q, orgId, projectId);
  const chosen = options.photoIds;
  const [phases, photos, reports, reached, upcoming, changes, asks] = await Promise.all([
    settings.reportShowProgress
      ? q.query<{ name: string; progressPct: number }>('select name, progress_pct as "progressPct" from project_phase where project_id = $1 order by position, name', [projectId])
      : null,
    !settings.reportPhotos ? null
      : chosen
        ? q.query<{ id: string; takenAt: string; phase: string | null }>(
          `select ph.id, to_char(ph.taken_at, 'YYYY-MM-DD') as "takenAt", x.name as phase from report_photo ph join site_report r on r.id = ph.report_id
             left join project_phase x on x.id = r.phase_id
            where r.project_id = $1 and r.org_id = $2 and r.status = 'validated' and ph.shared_with_client and ph.id = any($3::uuid[])
            order by ph.taken_at desc`, [projectId, orgId, chosen])
        : candidatePhotos(q, orgId, projectId, from, to, settings.reportPhotos).then((rows) => ({ rows })),
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
    asksOf(q, orgId, projectId),
  ]);
  return {
    id: options.id ?? null, status: options.status ?? 'preview',
    period: { from, to },
    company: { name: project.company, logoKey: settings.logoKey, accentColor: settings.accentColor, font: settings.font, address: settings.address, phone: settings.phone, email: settings.email },
    project: { id: project.id, code: project.code, name: project.name, location: project.location, clientName: project.clientName, progressPct: project.progressPct, endDate: project.endDate },
    intro: settings.reportIntro, note, sections: options.sections ?? {},
    phases: phases?.rows ?? null, photos: photos?.rows ?? [], reportsCount: reports.rows[0]?.n ?? 0,
    reached: reached?.rows ?? null, upcoming: upcoming?.rows ?? null, changes: changes?.rows ?? null, asks, currency: project.currency,
  };
}

async function factsOf(q: Query, orgId: string, projectId: string, from: string, to: string): Promise<ReportFacts> {
  const project = await projectRow(q, orgId, projectId);
  const [notes, phases, reached, upcoming, reports, asks] = await Promise.all([
    q.query<{ date: string; phase: string | null; text: string }>(
      `select to_char(r.taken_at, 'YYYY-MM-DD') as date, x.name as phase, left(coalesce(nullif(r.note, ''), r.transcript), 1500) as text
         from site_report r left join project_phase x on x.id = r.phase_id
        where r.project_id = $1 and r.org_id = $2 and r.status = 'validated' and r.taken_at::date between $3 and $4
          and coalesce(nullif(r.note, ''), r.transcript) is not null
        order by r.taken_at limit 40`, [projectId, orgId, from, to]),
    q.query<{ name: string; progressPct: number }>('select name, progress_pct as "progressPct" from project_phase where project_id = $1 order by position, name', [projectId]),
    q.query<{ name: string; actualOn: string }>(`select name, to_char(actual_on, 'YYYY-MM-DD') as "actualOn" from milestone where project_id = $1 and org_id = $2 and actual_on between $3 and $4 order by actual_on`, [projectId, orgId, from, to]),
    q.query<{ name: string; plannedOn: string }>(`select name, to_char(planned_on, 'YYYY-MM-DD') as "plannedOn" from milestone where project_id = $1 and org_id = $2 and actual_on is null order by planned_on limit 3`, [projectId, orgId]),
    q.query<{ n: number }>(`select count(*)::int as n from site_report where project_id = $1 and org_id = $2 and status = 'validated' and taken_at::date between $3 and $4`, [projectId, orgId, from, to]),
    asksOf(q, orgId, projectId),
  ]);
  return {
    company: project.company,
    project: { name: project.name, code: project.code, progressPct: project.progressPct, endDate: project.endDate, clientName: project.clientName },
    period: { from, to }, reportsCount: reports.rows[0]?.n ?? 0,
    notes: notes.rows, phases: phases.rows, reached: reached.rows, upcoming: upcoming.rows, asks,
  };
}

/**
 * The figures of a text that the facts do not contain (a percentage, a date, an amount the
 * assistant would have invented). Shown to the office as a warning before sending.
 */
export function unknownFigures(text: string | null | undefined, facts: unknown): string[] {
  if (!text) return [];
  const haystack = JSON.stringify(facts).replace(/[\s  ]/gu, '');
  const found = text.match(/\d[\d\s  ]*(?:[.,]\d+)?/gu) ?? [];
  const unknown = found.map((value) => value.replace(/[\s  ]/gu, '').replace(/[.,]$/u, '')).filter((value) => {
    if (value.length === 0) return false;
    const plain = value.replace(',', '.');
    return !haystack.includes(value) && !haystack.includes(plain) && !(Number(plain) <= 31 && haystack.includes(`-${plain.padStart(2, '0')}`));
  });
  return [...new Set(unknown)];
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const period = z.object({ from: day, to: day });
const sectionText = z.string().trim().max(3000).nullable().optional();
const sectionsInput = z.object({ summary: sectionText, done: sectionText, next: sectionText, ask: sectionText });
const WRITERS = ['owner', 'admin', 'engineer'];

/** A preview of a report for a period, without saving it. */
export async function clientReport(db: Db, actor: Actor, projectId: string, input: unknown, note: string | null = null): Promise<ClientReport> {
  const data = parse(period, input);
  if (data.to < data.from) throw new DomainError('invalid_input', 422, { field: 'to', detail: '' });
  return asActor(db, actor, (tx) => build(tx, actor.orgId, projectId, data.from, data.to, note));
}

export interface ClientReportRow { id: string; status: 'draft' | 'sent'; from: string; to: string; note: string | null; sentTo: string | null; sentAt: string | null; automatic: boolean; createdAt: string }

export async function listClientReports(db: Db, actor: Actor, projectId: string): Promise<ClientReportRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ClientReportRow>(
      `select id, status, to_char(period_from, 'YYYY-MM-DD') as "from", to_char(period_to, 'YYYY-MM-DD') as "to", note, sent_to as "sentTo", sent_at as "sentAt", automatic, created_at as "createdAt"
         from client_report where org_id = $1 and project_id = $2 order by created_at desc limit 50`, [actor.orgId, projectId]);
    return rows;
  });
}

/** Keeps a report sent at once for a period (spec 049 door, kept for assistants and tests). */
export async function saveClientReport(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  if (!WRITERS.includes(actor.role)) throw new DomainError('forbidden', 403);
  const data = parse(period.extend({ projectId: z.string().uuid(), note: z.string().trim().max(2000).nullable().optional(), sentTo: z.string().trim().max(254).nullable().optional() }), input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      `insert into client_report (org_id, project_id, period_from, period_to, note, sent_to, sent_at, status, created_by)
       values ($1, $2, $3, $4, $5, $6, case when $6::text is null then null else now() end, case when $6::text is null then 'draft' else 'sent' end, $7) returning id`,
      [actor.orgId, data.projectId, data.from, data.to, data.note || null, data.sentTo || null, actor.userId]);
    if (data.sentTo) {
      const snapshot = await build(tx, actor.orgId, data.projectId, data.from, data.to, data.note || null, { id: rows[0]!.id, status: 'sent' });
      await tx.query('update client_report set snapshot = $2 where id = $1', [rows[0]!.id, JSON.stringify(snapshot)]);
    }
    await journal(tx, actor, 'client_report.send', rows[0]!.id, null, { projectId: data.projectId, from: data.from, to: data.to, sentTo: data.sentTo ? 'set' : null });
    return { id: rows[0]!.id };
  });
}

// ---------------------------------------------------------------- drafts (spec 050)

interface DraftRow { id: string; projectId: string; status: 'draft' | 'sent'; from: string; to: string; note: string | null; sections: ReportSections; photoIds: string[] | null; snapshot: ClientReport | null; automatic: boolean; sentTo: string | null; sentAt: string | null }

async function draftRow(q: Query, orgId: string, id: string): Promise<DraftRow> {
  const { rows } = await q.query<DraftRow>(
    `select id, project_id as "projectId", status, to_char(period_from, 'YYYY-MM-DD') as "from", to_char(period_to, 'YYYY-MM-DD') as "to", note, sections,
            photo_ids as "photoIds", snapshot, automatic, sent_to as "sentTo", sent_at as "sentAt"
       from client_report where id = $1 and org_id = $2`, [id, orgId]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

/** Starts a draft for a period: the period's photos are chosen up to the company's number. */
export async function createClientReportDraft(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  if (!WRITERS.includes(actor.role)) throw new DomainError('forbidden', 403);
  const data = parse(period.extend({ projectId: z.string().uuid(), sections: sectionsInput.optional() }), input);
  if (data.to < data.from) throw new DomainError('invalid_input', 422, { field: 'to', detail: '' });
  return asActor(db, actor, async (tx) => {
    await projectRow(tx, actor.orgId, data.projectId);
    const settings = await readSettings(tx, actor.orgId);
    const photos = await candidatePhotos(tx, actor.orgId, data.projectId, data.from, data.to, settings.reportPhotos);
    const { rows } = await tx.query<{ id: string }>(
      `insert into client_report (org_id, project_id, period_from, period_to, status, sections, photo_ids, created_by)
       values ($1, $2, $3, $4, 'draft', $5, $6, $7) returning id`,
      [actor.orgId, data.projectId, data.from, data.to, JSON.stringify(data.sections ?? {}), photos.map((photo) => photo.id), actor.userId]);
    await journal(tx, actor, 'client_report.draft', rows[0]!.id, null, { projectId: data.projectId, from: data.from, to: data.to });
    return { id: rows[0]!.id };
  });
}

export interface ClientReportDraft {
  id: string; projectId: string; status: 'draft' | 'sent'; automatic: boolean; sentTo: string | null; sentAt: string | null;
  report: ClientReport;
  facts: ReportFacts;
  candidates: { id: string; takenAt: string; phase: string | null; chosen: boolean }[];
  warnings: Partial<Record<ReportSection, string[]>>;
}

/** A draft (or a sent report) with its live preview, the facts, the photos to choose from and the figure warnings. */
export async function clientReportDraft(db: Db, actor: Actor, id: string): Promise<ClientReportDraft> {
  return asActor(db, actor, async (tx) => {
    const row = await draftRow(tx, actor.orgId, id);
    const facts = await factsOf(tx, actor.orgId, row.projectId, row.from, row.to);
    const report = row.status === 'sent' && row.snapshot
      ? row.snapshot
      : await build(tx, actor.orgId, row.projectId, row.from, row.to, row.note, { id: row.id, status: row.status, sections: row.sections, photoIds: row.photoIds });
    const chosen = new Set(row.photoIds ?? report.photos.map((photo) => photo.id));
    const candidates = (await candidatePhotos(tx, actor.orgId, row.projectId, row.from, row.to)).map((photo) => ({ ...photo, chosen: chosen.has(photo.id) }));
    const warnings: ClientReportDraft['warnings'] = {};
    for (const key of REPORT_SECTIONS) {
      const list = unknownFigures(row.sections[key], facts);
      if (list.length) warnings[key] = list;
    }
    return { id: row.id, projectId: row.projectId, status: row.status, automatic: row.automatic, sentTo: row.sentTo, sentAt: row.sentAt, report, facts, candidates, warnings };
  });
}

/** The facts of a draft, for an assistant to write from. */
export async function clientReportFacts(db: Db, actor: Actor, id: string): Promise<ReportFacts> {
  return asActor(db, actor, async (tx) => {
    const row = await draftRow(tx, actor.orgId, id);
    return factsOf(tx, actor.orgId, row.projectId, row.from, row.to);
  });
}

const draftPatch = z.object({
  from: day.optional(), to: day.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  sections: sectionsInput.optional(),
  photoIds: z.array(z.string().uuid()).max(24).optional(),
});

/** Changes a draft: its period, sections (merged), chosen photos or note. A sent report is frozen. */
export async function updateClientReportDraft(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  if (!WRITERS.includes(actor.role)) throw new DomainError('forbidden', 403);
  const data = parse(draftPatch, input);
  await asActor(db, actor, async (tx) => {
    const row = await draftRow(tx, actor.orgId, id);
    if (row.status !== 'draft') throw new DomainError('report_sent', 409);
    const from = data.from ?? row.from;
    const to = data.to ?? row.to;
    if (to < from) throw new DomainError('invalid_input', 422, { field: 'to', detail: '' });
    await tx.query(
      `update client_report set period_from = $3, period_to = $4, note = case when $5 then $6 else note end,
              sections = sections || $7::jsonb, photo_ids = coalesce($8::uuid[], photo_ids), updated_at = now()
        where id = $1 and org_id = $2`,
      [id, actor.orgId, from, to, data.note !== undefined, data.note || null, JSON.stringify(data.sections ?? {}), data.photoIds ?? null]);
    await journal(tx, actor, 'client_report.edit', id, null, { sections: Object.keys(data.sections ?? {}), photos: data.photoIds?.length ?? null, period: data.from || data.to ? { from, to } : null });
  });
}

/** Freezes a draft as sent: the client will always see exactly this. */
export async function sendClientReportDraft(db: Db, actor: Actor, id: string, sentTo: string | null): Promise<ClientReport> {
  if (!WRITERS.includes(actor.role)) throw new DomainError('forbidden', 403);
  return asActor(db, actor, async (tx) => {
    const row = await draftRow(tx, actor.orgId, id);
    if (row.status !== 'draft') throw new DomainError('report_sent', 409);
    const snapshot = await build(tx, actor.orgId, row.projectId, row.from, row.to, row.note, { id, status: 'sent', sections: row.sections, photoIds: row.photoIds });
    await tx.query(`update client_report set status = 'sent', snapshot = $3, sent_to = $4, sent_at = now(), updated_at = now() where id = $1 and org_id = $2`,
      [id, actor.orgId, JSON.stringify(snapshot), sentTo]);
    await journal(tx, actor, 'client_report.send', id, null, { projectId: row.projectId, from: row.from, to: row.to, sentTo: sentTo ? 'set' : null });
    return snapshot;
  });
}

/** Deletes a draft never sent. */
export async function deleteClientReportDraft(db: Db, actor: Actor, id: string): Promise<void> {
  if (!WRITERS.includes(actor.role)) throw new DomainError('forbidden', 403);
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(`delete from client_report where id = $1 and org_id = $2 and status = 'draft'`, [id, actor.orgId]);
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'client_report.delete', id, null, null);
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
export async function portalClientReports(owner: Db, token: string): Promise<{ id: string; from: string; to: string; sentAt: string; summary: string | null }[]> {
  const { rows } = await owner.query<{ id: string; from: string; to: string; sentAt: string; summary: string | null }>(
    `select r.id, to_char(r.period_from, 'YYYY-MM-DD') as "from", to_char(r.period_to, 'YYYY-MM-DD') as "to", r.sent_at as "sentAt",
            nullif(coalesce(r.snapshot -> 'sections' ->> 'summary', r.sections ->> 'summary'), '') as summary
       from portal_link l join client_report r on r.project_id = l.project_id and r.org_id = l.org_id
      where l.token_hash = $1 and l.revoked_at is null and r.status = 'sent' and r.sent_at is not null order by r.sent_at desc limit 30`, [hashToken(token)]);
  return rows;
}

export async function portalClientReport(owner: Db, token: string, reportId: string): Promise<ClientReport | null> {
  const { rows } = await owner.query<{ orgId: string; projectId: string; from: string; to: string; note: string | null; showPhotos: boolean; snapshot: ClientReport | null }>(
    `select l.org_id as "orgId", l.project_id as "projectId", to_char(r.period_from, 'YYYY-MM-DD') as "from", to_char(r.period_to, 'YYYY-MM-DD') as "to", r.note,
            l.show_photos as "showPhotos", r.snapshot
       from portal_link l join client_report r on r.project_id = l.project_id and r.org_id = l.org_id
      where l.token_hash = $1 and l.revoked_at is null and r.id = $2 and r.status = 'sent' and r.sent_at is not null`, [hashToken(token), reportId]);
  const link = rows[0];
  if (!link) return null;
  const report = link.snapshot ?? await build(owner as unknown as Query, link.orgId, link.projectId, link.from, link.to, link.note, { id: reportId, status: 'sent' });
  return link.showPhotos ? report : { ...report, photos: [] };
}

/** Sites whose company prepares the report every week, with the client's address, the sealed link and who to tell in the office. */
export async function weeklyReportTargets(owner: Db) {
  const { rows } = await owner.query<{ orgId: string; projectId: string; projectName: string; projectCode: string; company: string; locale: 'fr' | 'en'; timeZone: string; autoSend: boolean; officeEmail: string | null; email: string; contactName: string | null; tokenEnc: string | null }>(
    `select p.org_id as "orgId", p.id as "projectId", p.name as "projectName", p.code as "projectCode", o.name as company, s.locale, s.time_zone as "timeZone",
            i.report_auto_send as "autoSend",
            coalesce((select u.email from "user" u where u.id = p.manager_id),
                     (select u.email from member m join "user" u on u.id = m."userId" where m."organizationId" = p.org_id and m.role = 'owner' order by m."createdAt" limit 1)) as "officeEmail",
            l.contact_email as email, l.contact_name as "contactName", l.token_enc as "tokenEnc"
       from project p join organization o on o.id = p.org_id join org_settings s on s.org_id = p.org_id
       join invoice_settings i on i.org_id = p.org_id and i.report_weekly
       join lateral (select * from portal_link x where x.project_id = p.id and x.revoked_at is null and x.contact_email is not null order by x.created_at desc limit 1) l on true
      where p.status = 'active' and p.archived_at is null and not s.is_demo`);
  return rows;
}

/** The facts of a period for the weekly job (no person acting: platform connection). */
export async function automaticReportFacts(owner: Db, orgId: string, projectId: string, from: string, to: string): Promise<ReportFacts> {
  return factsOf(owner as unknown as Query, orgId, projectId, from, to);
}

/**
 * Records the weekly report (platform connection): a draft for the office to validate, or — when the
 * company chose to send without a reading — a report frozen and sent at once.
 */
export async function saveAutomaticClientReport(owner: Db, input: { orgId: string; projectId: string; from: string; to: string; sentTo: string | null; sections?: ReportSections }): Promise<string> {
  const q = owner as unknown as Query;
  const settings = await readSettings(q as Tx, input.orgId);
  const photos = (await candidatePhotos(q, input.orgId, input.projectId, input.from, input.to, settings.reportPhotos)).map((photo) => photo.id);
  const { rows } = await owner.query<{ id: string }>(
    `insert into client_report (org_id, project_id, period_from, period_to, status, sections, photo_ids, sent_to, sent_at, automatic)
     values ($1, $2, $3, $4, case when $5::text is null then 'draft' else 'sent' end, $6, $7, $5, case when $5::text is null then null else now() end, true) returning id`,
    [input.orgId, input.projectId, input.from, input.to, input.sentTo, JSON.stringify(input.sections ?? {}), photos]);
  const id = rows[0]!.id;
  if (input.sentTo) {
    const snapshot = await build(q, input.orgId, input.projectId, input.from, input.to, null, { id, status: 'sent', sections: input.sections ?? {}, photoIds: photos });
    await owner.query('update client_report set snapshot = $2 where id = $1', [id, JSON.stringify(snapshot)]);
  }
  return id;
}
