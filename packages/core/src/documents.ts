import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';

export const DOCUMENT_STATUSES = ['missing', 'pending', 'valid', 'to_fix'] as const;

export interface DocumentRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  docTypeId: string | null;
  typeName: string | null;
  title: string;
  required: boolean;
  status: 'missing' | 'pending' | 'valid' | 'to_fix' | 'expired';
  reference: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
  hasFile: boolean;
  sharedWithClient: boolean;
  note: string | null;
  /** Spec 048: administrative, technical (drawings, studies) or other. */
  family: 'admin' | 'technical' | 'contract' | 'other';
}

export async function listDocuments(db: Db, actor: Actor, filters: { projectId?: string } = {}): Promise<DocumentRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<DocumentRow>(
      `select d.id, d.project_id as "projectId", p.code as "projectCode", p.name as "projectName",
              d.doc_type_id as "docTypeId", t.name as "typeName", d.title, ds.required, ds.status, d.reference,
              d.issued_on as "issuedOn", d.expires_on as "expiresOn", ds.days_left as "daysLeft",
              d.storage_key is not null as "hasFile", d.shared_with_client as "sharedWithClient", d.note, d.family
         from project_document d join document_status ds on ds.document_id = d.id
         join project p on p.id = d.project_id left join doc_type t on t.id = d.doc_type_id
        where d.org_id = $1 and p.archived_at is null and ($2::uuid is null or d.project_id = $2)
        order by p.code, coalesce(t.position, 999), d.title`,
      [actor.orgId, filters.projectId || null],
    );
    return rows;
  });
}

/** Compliance per project: valid required documents over required documents. */
export async function complianceByProject(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id as "projectId", p.code, p.name,
              count(*) filter (where ds.required)::int as required,
              count(*) filter (where ds.required and ds.status = 'valid')::int as valid,
              case when count(*) filter (where ds.required) = 0 then null
                   else round(100.0 * count(*) filter (where ds.required and ds.status = 'valid')
                              / count(*) filter (where ds.required))::int end as pct
         from project p left join document_status ds on ds.project_id = p.id
        where p.org_id = $1 and p.archived_at is null and p.status <> 'done'
        group by p.id order by p.code`,
      [actor.orgId],
    );
    return rows as { projectId: string; code: string; name: string; required: number; valid: number; pct: number | null }[];
  });
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const documentInput = z.object({
  projectId: z.string().uuid(),
  docTypeId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  issuedOn: dateString.nullable().optional(),
  expiresOn: dateString.nullable().optional(),
  sharedWithClient: z.boolean().default(false),
  note: z.string().trim().max(2000).nullable().optional(),
  family: z.enum(['admin', 'technical', 'contract', 'other']).optional(),
});

export async function addDocument(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'documents.write');
  const data = parse(documentInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      `insert into project_document (org_id, project_id, doc_type_id, title, status, reference, issued_on, expires_on,
                                     shared_with_client, note, family)
       values ($1, $2, $3, $4, coalesce($5, case when $3::uuid is null then 'valid' else 'pending' end), $6, $7, $8, $9, $10,
               coalesce($11, case when exists (select 1 from doc_type where id = $3 and name ~* '(contrat|devis|march[ée]|avenant|contract|quote|agreement)') then 'contract'
                            when exists (select 1 from doc_type where id = $3 and required) then 'admin' else 'other' end)) returning id`,
      [actor.orgId, data.projectId, data.docTypeId ?? null, data.title, data.status ?? null, data.reference ?? null,
        data.issuedOn ?? null, data.expiresOn ?? null, data.sharedWithClient, data.note ?? null, data.family ?? null],
    );
    await journal(tx, actor, 'document.add', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

const documentPatch = documentInput.omit({ projectId: true }).partial();

export async function updateDocument(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'documents.write');
  const data = parse(documentPatch, input);
  const raw = (input ?? {}) as Record<string, unknown>;
  const columns: Record<string, string> = {
    docTypeId: 'doc_type_id', title: 'title', status: 'status', reference: 'reference', issuedOn: 'issued_on',
    expiresOn: 'expires_on', sharedWithClient: 'shared_with_client', note: 'note', family: 'family',
  };
  const entries = Object.entries(data).filter(([key, value]) => value !== undefined && key in raw && columns[key]);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from project_document where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    if (entries.length) {
      await tx.query(
        `update project_document set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')},
                updated_at = now() where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([, value]) => value)],
      );
    }
    await journal(tx, actor, 'document.update', id, before, Object.fromEntries(entries));
  });
}

/** Attaches a stored file to a document (the file itself is in object storage). */
export async function attachDocumentFile(
  db: Db,
  actor: Actor,
  id: string,
  file: { storageKey: string; mediaType: string; sizeBytes: number },
): Promise<void> {
  ensure(actor, 'documents.write');
  await asActor(db, actor, async (tx) => {
    // Spec 046: the file being replaced is kept as a previous version, never lost.
    await tx.query(
      `insert into document_version (org_id, document_id, storage_key, media_type, size_bytes, replaced_by)
       select org_id, id, storage_key, media_type, size_bytes, $3 from project_document
        where id = $1 and org_id = $2 and storage_key is not null and storage_key <> $4`,
      [id, actor.orgId, actor.userId, file.storageKey],
    );
    const { rowCount } = await tx.query(
      `update project_document set storage_key = $3, media_type = $4, size_bytes = $5, updated_at = now(),
              status = case when status = 'missing' then 'pending' else status end
        where id = $1 and org_id = $2`,
      [id, actor.orgId, file.storageKey, file.mediaType, file.sizeBytes],
    );
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'document.attach', id, null, file);
  });
}

export async function documentFile(db: Db, actor: Actor, id: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ storageKey: string | null; mediaType: string | null; title: string }>(
      'select storage_key as "storageKey", media_type as "mediaType", title from project_document where id = $1 and org_id = $2',
      [id, actor.orgId],
    );
    return rows[0] ?? null;
  });
}

export async function removeDocument(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'documents.write');
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('delete from project_document where id = $1 and org_id = $2 returning *', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await journal(tx, actor, 'document.remove', id, before, null);
  });
}
