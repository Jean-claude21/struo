import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';

export const INCIDENT_KINDS = ['material_delay', 'weather', 'defect', 'accident', 'equipment', 'other'] as const;
export const PRIORITIES = ['critical', 'important', 'info'] as const;

/** What the field app keeps on the device to work offline: the open sites and their phases. */
export async function fieldSnapshot(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id, p.code, p.name, p.location, p.status, pp.progress_pct as "progressPct",
              coalesce((select json_agg(json_build_object('id', ph.id, 'name', ph.name, 'progressPct', ph.progress_pct)
                                        order by ph.position)
                          from project_phase ph where ph.project_id = p.id), '[]') as phases
         from project p join project_progress pp on pp.project_id = p.id
        where p.org_id = $1 and p.archived_at is null and p.status in ('active', 'pending', 'suspended')
        order by case p.status when 'active' then 0 else 1 end, p.code`,
      [actor.orgId],
    );
    return {
      at: new Date().toISOString(),
      projects: rows as {
        id: string; code: string; name: string; location: string | null; status: string; progressPct: number;
        phases: { id: string; name: string; progressPct: number }[];
      }[],
    };
  });
}

const photoInput = z.object({
  id: z.string().uuid(),
  storageKey: z.string().min(1).max(300),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  takenAt: z.string().datetime({ offset: true }),
});

const reportInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  phaseId: z.string().uuid().nullable().optional(),
  progressPct: z.number().int().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(4000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  takenAt: z.string().datetime({ offset: true }),
  photos: z.array(photoInput).max(20).default([]),
});

/**
 * Receives a report written on the device. Its id is the idempotency key: sending it again (the
 * network dropped after the server saved it) changes nothing and answers `created: false`.
 */
export async function submitReport(db: Db, actor: Actor, input: unknown): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(reportInput, input);
  if (data.progressPct != null && !data.phaseId) throw new DomainError('phase_required', 422);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const inserted = await tx.query(
      `insert into site_report (id, org_id, project_id, phase_id, author_id, progress_pct, note, latitude, longitude, taken_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, data.phaseId ?? null, actor.userId, data.progressPct ?? null,
        data.note || null, data.latitude ?? null, data.longitude ?? null, data.takenAt],
    );
    for (const photo of data.photos) {
      await tx.query(
        `insert into report_photo (id, org_id, report_id, storage_key, media_type, size_bytes, latitude, longitude, taken_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing`,
        [photo.id, actor.orgId, data.id, photo.storageKey, photo.mediaType, photo.sizeBytes,
          photo.latitude ?? null, photo.longitude ?? null, photo.takenAt],
      );
    }
    const created = inserted.rowCount === 1;
    if (created) await journal(tx, actor, 'report.submit', data.id, null, { ...data, photos: data.photos.length });
    return { id: data.id, created };
  });
}

const incidentInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reportId: z.string().uuid().nullable().optional(),
  kind: z.enum(INCIDENT_KINDS),
  priority: z.enum(PRIORITIES),
  description: z.string().trim().min(1).max(4000),
});

export async function reportIncident(db: Db, actor: Actor, input: unknown): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(incidentInput, input);
  return asActor(db, actor, async (tx) => {
    const inserted = await tx.query(
      `insert into incident (id, org_id, project_id, report_id, kind, priority, description, created_by)
       select $1, $2, $3, $4, $5, $6, $7, $8 where exists (select 1 from project where id = $3 and org_id = $2)
       on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, data.reportId ?? null, data.kind, data.priority, data.description, actor.userId],
    );
    const created = inserted.rowCount === 1;
    if (created) await journal(tx, actor, 'incident.report', data.id, null, data);
    return { id: data.id, created };
  });
}

export interface ReportRow {
  id: string;
  projectId: string;
  projectName: string;
  phaseName: string | null;
  authorName: string;
  progressPct: number | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  takenAt: string;
  status: 'submitted' | 'validated' | 'rejected';
  reviewNote: string | null;
  photos: { id: string; takenAt: string }[];
}

export async function listReports(
  db: Db,
  actor: Actor,
  filters: { projectId?: string; status?: string; limit?: number } = {},
): Promise<ReportRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ReportRow>(
      `select r.id, r.project_id as "projectId", p.name as "projectName", ph.name as "phaseName", u.name as "authorName",
              r.progress_pct as "progressPct", r.note, r.latitude, r.longitude, r.taken_at as "takenAt", r.status,
              r.review_note as "reviewNote",
              coalesce((select json_agg(json_build_object('id', f.id, 'takenAt', f.taken_at) order by f.taken_at)
                          from report_photo f where f.report_id = r.id), '[]') as photos
         from site_report r join project p on p.id = r.project_id
         join "user" u on u.id = r.author_id
         left join project_phase ph on ph.id = r.phase_id
        where r.org_id = $1 and ($2::uuid is null or r.project_id = $2) and ($3::text is null or r.status = $3)
        order by r.taken_at desc limit $4`,
      [actor.orgId, filters.projectId || null, filters.status || null, Math.min(filters.limit ?? 50, 200)],
    );
    return rows;
  });
}

/**
 * The engineer validates or rejects a report. A validated report with a progress applies it to its
 * phase (the field's word becomes the project's figure only once reviewed).
 */
export async function reviewReport(
  db: Db,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<void> {
  ensure(actor, 'field.review');
  const data = parse(z.object({ decision: z.enum(['validated', 'rejected']), note: z.string().trim().max(1000).nullable().optional() }), input);
  await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ status: string; phase_id: string | null; progress_pct: number | null }>(
      'select status, phase_id, progress_pct from site_report where id = $1 and org_id = $2 for update',
      [id, actor.orgId],
    );
    const report = rows[0];
    if (!report) throw notFound();
    if (report.status !== 'submitted') throw new DomainError('already_reviewed', 409);
    await tx.query(
      `update site_report set status = $3, reviewed_by = $4, reviewed_at = now(), review_note = $5 where id = $1 and org_id = $2`,
      [id, actor.orgId, data.decision, actor.userId, data.note ?? null],
    );
    if (data.decision === 'validated' && report.phase_id && report.progress_pct != null) {
      const before = (await tx.query('select progress_pct from project_phase where id = $1', [report.phase_id])).rows[0];
      await tx.query('update project_phase set progress_pct = $2, updated_at = now() where id = $1', [report.phase_id, report.progress_pct]);
      await journal(tx, actor, 'phase.progress', report.phase_id, before, { progressPct: report.progress_pct, report: id });
    }
    await journal(tx, actor, 'report.review', id, { status: report.status }, data);
  });
}

export async function listIncidents(db: Db, actor: Actor, filters: { projectId?: string; status?: string } = {}) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select i.id, i.project_id as "projectId", p.name as "projectName", i.kind, i.priority, i.description, i.status,
              u.name as "authorName", i.created_at as "createdAt", i.resolved_at as "resolvedAt"
         from incident i join project p on p.id = i.project_id join "user" u on u.id = i.created_by
        where i.org_id = $1 and ($2::uuid is null or i.project_id = $2) and ($3::text is null or i.status = $3)
        order by i.status, case i.priority when 'critical' then 0 when 'important' then 1 else 2 end, i.created_at desc
        limit 200`,
      [actor.orgId, filters.projectId || null, filters.status || null],
    );
    return rows as {
      id: string; projectId: string; projectName: string; kind: string; priority: string; description: string;
      status: string; authorName: string; createdAt: string; resolvedAt: string | null;
    }[];
  });
}

export async function resolveIncident(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'field.review');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(
      `update incident set status = 'resolved', resolved_at = now() where id = $1 and org_id = $2 and status = 'open'`,
      [id, actor.orgId],
    );
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'incident.resolve', id, { status: 'open' }, { status: 'resolved' });
  });
}

/** Where a photo is stored, if the actor's company owns it. */
export async function photoLocation(db: Db, actor: Actor, photoId: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ storageKey: string; mediaType: string }>(
      'select storage_key as "storageKey", media_type as "mediaType" from report_photo where id = $1 and org_id = $2',
      [photoId, actor.orgId],
    );
    return rows[0] ?? null;
  });
}
