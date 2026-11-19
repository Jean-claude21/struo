import { asActor } from './access.ts';
import type { Actor, Db } from './db.ts';

export interface SearchHit {
  kind: 'project' | 'client' | 'invoice' | 'document';
  id: string;
  projectId: string | null;
  title: string;
  detail: string | null;
  status: string | null;
}

/** One query across the company's sites, clients, invoices and documents (command palette). */
export async function searchCompany(db: Db, actor: Actor, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/gu, (char) => `\\${char}`)}%`;
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<SearchHit>(
      `(select 'project' as kind, p.id::text, p.id::text as "projectId", p.code || ' · ' || p.name as title, p.location as detail, p.status
          from project p where p.org_id = $1 and p.archived_at is null and (p.name ilike $2 or p.code ilike $2 or p.location ilike $2)
          order by p.code limit 6)
       union all
       (select 'client', c.id::text, null, c.name, coalesce(c.phone, c.email), null
          from client c where c.org_id = $1 and c.archived_at is null and (c.name ilike $2 or c.email ilike $2 or c.phone ilike $2)
          order by c.name limit 5)
       union all
       (select 'invoice', i.id::text, i.project_id::text, i.number || ' · ' || p.name, null, i.status
          from invoice i join project p on p.id = i.project_id
         where i.org_id = $1 and (i.number ilike $2 or p.name ilike $2 or i.label ilike $2)
         order by i.issued_on desc limit 5)
       union all
       (select 'document', d.id::text, d.project_id::text, d.title, p.code, d.status
          from project_document d join project p on p.id = d.project_id
         where d.org_id = $1 and (d.title ilike $2 or d.reference ilike $2)
         order by d.updated_at desc limit 5)`,
      [actor.orgId, like],
    );
    return rows;
  });
}
