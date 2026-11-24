import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';

/**
 * Spec 052: material requested from the field. The site lead asks (offline too: the request carries
 * its own id), the office orders it, marks it delivered or cancels it with a word, and the field sees
 * where it stands.
 */

export const MATERIAL_STATUSES = ['open', 'ordered', 'delivered', 'cancelled'] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export interface MaterialRequestRow {
  id: string; projectId: string; projectCode: string; projectName: string; item: string; quantity: string | null; neededOn: string | null;
  note: string | null; status: MaterialStatus; officeNote: string | null; requestedBy: string | null; requesterName: string | null;
  handlerName: string | null; handledAt: string | null; createdAt: string;
}

const requestInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  item: z.string().trim().min(1).max(200),
  quantity: z.string().trim().max(80).nullable().optional(),
  neededOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** Asks for material on a site. Sending the same request twice changes nothing. */
export async function createMaterialRequest(db: Db, actor: Actor, input: unknown): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(requestInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const inserted = await tx.query(
      `insert into material_request (id, org_id, project_id, requested_by, item, quantity, needed_on, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, actor.userId, data.item, data.quantity || null, data.neededOn ?? null, data.note || null]);
    if (inserted.rowCount) await journal(tx, actor, 'material.request', data.id, null, { projectId: data.projectId, item: data.item });
    return { id: data.id, created: Boolean(inserted.rowCount) };
  });
}

export async function listMaterialRequests(db: Db, actor: Actor, filters: { projectId?: string; open?: boolean; mine?: boolean; limit?: number } = {}): Promise<MaterialRequestRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<MaterialRequestRow>(
      `select r.id, r.project_id as "projectId", p.code as "projectCode", p.name as "projectName", r.item, r.quantity, to_char(r.needed_on, 'YYYY-MM-DD') as "neededOn",
              r.note, r.status, r.office_note as "officeNote", r.requested_by as "requestedBy", u.name as "requesterName", h.name as "handlerName",
              to_char(r.handled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "handledAt",
              to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
         from material_request r join project p on p.id = r.project_id
         left join "user" u on u.id = r.requested_by left join "user" h on h.id = r.handled_by
        where r.org_id = $1 and ($2::uuid is null or r.project_id = $2) and (not $3 or r.status in ('open', 'ordered')) and (not $4 or r.requested_by = $5)
        order by (r.status = 'open') desc, r.needed_on nulls last, r.created_at desc limit $6`,
      [actor.orgId, filters.projectId ?? null, Boolean(filters.open), Boolean(filters.mine), actor.userId, filters.limit ?? 100]);
    return rows;
  });
}

/** The office moves a request on: ordered, delivered or cancelled, with an optional word for the field. */
export async function updateMaterialRequest(db: Db, actor: Actor, id: string, input: unknown): Promise<{ requestedBy: string | null; projectId: string; item: string; status: MaterialStatus }> {
  ensure(actor, 'field.review');
  const data = parse(z.object({ status: z.enum(['ordered', 'delivered', 'cancelled']), officeNote: z.string().trim().max(500).nullable().optional() }), input);
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ requestedBy: string | null; projectId: string; item: string; status: MaterialStatus }>(
      `update material_request set status = $3, office_note = coalesce($4, office_note), handled_by = $5, handled_at = now()
        where id = $1 and org_id = $2 and status in ('open', 'ordered')
        returning requested_by as "requestedBy", project_id as "projectId", item, status`,
      [id, actor.orgId, data.status, data.officeNote || null, actor.userId]);
    if (!rows[0]) throw new DomainError('request_closed', 409);
    await journal(tx, actor, 'material.update', id, null, data);
    return rows[0];
  });
}
