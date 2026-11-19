import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const signatureInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  subjectKind: z.enum(['delivery', 'milestone', 'pv', 'checklist']),
  subjectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  signerName: z.string().trim().min(2).max(120),
  signerRole: z.string().trim().max(80).nullable().optional(),
  verdict: z.enum(['conform', 'reserve']).default('conform'),
  reserveNote: z.string().trim().max(2000).nullable().optional(),
});

/**
 * A signature drawn on screen (PV, delivery, milestone). The image is stored first by the caller;
 * its key is recorded here with who signed, as what, and any reserve.
 */
export async function recordSignature(db: Db, actor: Actor, input: unknown, imageKey: string, via: 'field' | 'office'): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(signatureInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const inserted = await tx.query(
      `insert into signature (id, org_id, project_id, subject_kind, subject_id, title, signer_name, signer_role, verdict, reserve_note, image_key, via, author_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, data.subjectKind, data.subjectId ?? null, data.title, data.signerName, data.signerRole ?? null,
        data.verdict, data.reserveNote ?? null, imageKey, via, actor.userId],
    );
    const created = inserted.rowCount === 1;
    if (created) await journal(tx, actor, 'signature.record', data.id, null, { ...data, imageKey });
    return { id: data.id, created };
  });
}

export async function listSignatures(db: Db, actor: Actor, filters: { projectId?: string } = {}) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select s.id, s.project_id as "projectId", p.code as "projectCode", s.subject_kind as "subjectKind", s.subject_id as "subjectId",
              s.title, s.signer_name as "signerName", s.signer_role as "signerRole", s.verdict, s.reserve_note as "reserveNote",
              s.via, s.signed_at as "signedAt"
         from signature s join project p on p.id = s.project_id
        where s.org_id = $1 and ($2::uuid is null or s.project_id = $2) order by s.signed_at desc limit 200`,
      [actor.orgId, filters.projectId || null],
    );
    return rows as {
      id: string; projectId: string; projectCode: string; subjectKind: string; subjectId: string | null; title: string; signerName: string;
      signerRole: string | null; verdict: 'conform' | 'reserve'; reserveNote: string | null; via: string; signedAt: string;
    }[];
  });
}

export async function signatureImage(db: Db, actor: Actor, id: string): Promise<string | null> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ image_key: string }>('select image_key from signature where id = $1 and org_id = $2', [id, actor.orgId]);
    return rows[0]?.image_key ?? null;
  });
}

// ---------------------------------------------------------------- delivery notes

const deliveryInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supplier: z.string().trim().max(200).nullable().optional(),
  item: z.string().trim().min(1).max(300),
  quantity: z.number().min(0).max(1e9).nullable().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  deliveredOn: dateString,
  reference: z.string().trim().max(120).nullable().optional(),
  verdict: z.enum(['conform', 'reserve']).default('conform'),
  note: z.string().trim().max(2000).nullable().optional(),
  extracted: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** A delivery received on site, read from its delivery note (photo + extracted fields). */
export async function recordDelivery(db: Db, actor: Actor, input: unknown, photoKey: string | null): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(deliveryInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const inserted = await tx.query(
      `insert into delivery (id, org_id, project_id, supplier, item, quantity, unit, delivered_on, reference, photo_key, extracted, verdict, note, author_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, data.supplier ?? null, data.item, data.quantity ?? null, data.unit ?? null, data.deliveredOn,
        data.reference ?? null, photoKey, data.extracted ? JSON.stringify(data.extracted) : null, data.verdict, data.note ?? null, actor.userId],
    );
    const created = inserted.rowCount === 1;
    if (created) await journal(tx, actor, 'delivery.record', data.id, null, { ...data, photoKey });
    return { id: data.id, created };
  });
}

export async function listDeliveries(db: Db, actor: Actor, filters: { projectId?: string } = {}) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select d.id, d.project_id as "projectId", p.code as "projectCode", d.supplier, d.item, d.quantity::float as quantity, d.unit,
              d.delivered_on as "deliveredOn", d.reference, d.photo_key is not null as "hasPhoto", d.verdict, d.note, u.name as "authorName"
         from delivery d join project p on p.id = d.project_id join "user" u on u.id = d.author_id
        where d.org_id = $1 and ($2::uuid is null or d.project_id = $2) order by d.delivered_on desc, d.created_at desc limit 200`,
      [actor.orgId, filters.projectId || null],
    );
    return rows as {
      id: string; projectId: string; projectCode: string; supplier: string | null; item: string; quantity: number | null; unit: string | null;
      deliveredOn: string; reference: string | null; hasPhoto: boolean; verdict: string; note: string | null; authorName: string;
    }[];
  });
}

export async function deliveryPhoto(db: Db, actor: Actor, id: string): Promise<string | null> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ photo_key: string | null }>('select photo_key from delivery where id = $1 and org_id = $2', [id, actor.orgId]);
    return rows[0]?.photo_key ?? null;
  });
}
