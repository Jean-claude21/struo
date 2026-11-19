import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';

export interface ChecklistTemplate { id: string; name: string; items: string[]; required: boolean }

export async function listChecklistTemplates(db: Db, actor: Actor): Promise<ChecklistTemplate[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ChecklistTemplate>(
      `select id, name, items, required from checklist_template where org_id = $1 and archived_at is null order by position, name`,
      [actor.orgId],
    );
    return rows;
  });
}

const runInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  items: z.array(z.object({ label: z.string().trim().min(1).max(200), done: z.boolean(), note: z.string().trim().max(500).nullable().optional() })).min(1).max(40),
  doneAt: z.string().datetime({ offset: true }),
});

/** A checklist filled on site (offline first: the id is the idempotency key). */
export async function submitChecklist(db: Db, actor: Actor, input: unknown): Promise<{ id: string; created: boolean }> {
  ensure(actor, 'field.report');
  const data = parse(runInput, input);
  const done = data.items.filter((item) => item.done).length;
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const inserted = await tx.query(
      `insert into checklist_run (id, org_id, project_id, template_id, name, items, done_count, total_count, completed, author_id, done_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (id) do nothing`,
      [data.id, actor.orgId, data.projectId, data.templateId ?? null, data.name, JSON.stringify(data.items), done, data.items.length,
        done === data.items.length, actor.userId, data.doneAt],
    );
    const created = inserted.rowCount === 1;
    if (created) await journal(tx, actor, 'checklist.submit', data.id, null, { projectId: data.projectId, name: data.name, done, total: data.items.length });
    return { id: data.id, created };
  });
}

export async function listChecklistRuns(db: Db, actor: Actor, filters: { projectId?: string; limit?: number } = {}) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select c.id, c.project_id as "projectId", p.code as "projectCode", p.name as "projectName", c.name, c.items,
              c.done_count as "doneCount", c.total_count as "totalCount", c.completed, u.name as "authorName", c.done_at as "doneAt"
         from checklist_run c join project p on p.id = c.project_id join "user" u on u.id = c.author_id
        where c.org_id = $1 and ($2::uuid is null or c.project_id = $2)
        order by c.done_at desc limit $3`,
      [actor.orgId, filters.projectId || null, Math.min(filters.limit ?? 50, 200)],
    );
    return rows as {
      id: string; projectId: string; projectCode: string; projectName: string; name: string; items: { label: string; done: boolean; note?: string | null }[];
      doneCount: number; totalCount: number; completed: boolean; authorName: string; doneAt: string;
    }[];
  });
}
