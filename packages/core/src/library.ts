import { asActor } from './access.ts';
import type { Actor, Db } from './db.ts';

export interface LibraryFile {
  id: string;
  kind: 'photo' | 'audio' | 'document' | 'invoice';
  name: string;
  mediaType: string | null;
  sizeBytes: number | null;
  date: string;
  author: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Where it comes from: the report, the document or the invoice. */
  originId: string;
  originLabel: string | null;
  status: string | null;
}

/**
 * Every file of the company in one list (spec 021): report photos, voice notes, document files and
 * invoices. Newest first, capped; the explorer filters on the device.
 */
export async function fileLibrary(db: Db, actor: Actor, limit = 600): Promise<LibraryFile[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<LibraryFile>(
      `select * from (
         select ph.id::text, 'photo' as kind, 'Photo ' || to_char(ph.taken_at, 'DD/MM/YYYY HH24:MI') as name, ph.media_type as "mediaType",
                ph.size_bytes as "sizeBytes", ph.taken_at as date, u.name as author, p.id::text as "projectId", p.code as "projectCode",
                p.name as "projectName", r.id::text as "originId", left(coalesce(r.note, ''), 80) as "originLabel", r.status
           from report_photo ph join site_report r on r.id = ph.report_id join project p on p.id = r.project_id
           join "user" u on u.id = r.author_id
          where ph.org_id = $1 and p.archived_at is null
         union all
         select r.id::text, 'audio', 'Note vocale ' || to_char(r.taken_at, 'DD/MM/YYYY HH24:MI'), r.audio_media_type, r.audio_size_bytes,
                r.taken_at, u.name, p.id::text, p.code, p.name, r.id::text, left(coalesce(r.transcript, r.note, ''), 80), r.status
           from site_report r join project p on p.id = r.project_id join "user" u on u.id = r.author_id
          where r.org_id = $1 and r.audio_key is not null and p.archived_at is null
         union all
         select d.id::text, 'document', d.title, d.media_type, d.size_bytes, d.updated_at, null, p.id::text, p.code, p.name,
                d.id::text, d.reference, ds.status
           from project_document d join document_status ds on ds.document_id = d.id join project p on p.id = d.project_id
          where d.org_id = $1 and d.storage_key is not null and p.archived_at is null
         union all
         select i.id::text, 'invoice', i.number || coalesce(' · ' || i.label, ''), 'application/pdf', null, i.issued_on::timestamptz, null,
                p.id::text, p.code, p.name, i.id::text, i.number, i.status
           from invoice i join project p on p.id = i.project_id
          where i.org_id = $1 and i.status <> 'draft' and p.archived_at is null
       ) files order by date desc limit $2`,
      [actor.orgId, limit],
    );
    return rows.map((row) => ({ ...row, date: new Date(row.date).toISOString() }));
  });
}
