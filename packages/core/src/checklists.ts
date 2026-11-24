import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { randomUUID } from 'node:crypto';
import { DomainError, notFound } from './errors.ts';

/**
 * Spec 048: a checklist is daily (every day on every active site), tied to a phase (shown while a
 * phase of that name is under way on the site) or on demand. Unticked points create an incident,
 * whose task clears them.
 */
export interface ChecklistTemplate { id: string; name: string; items: string[]; required: boolean; mode: 'daily' | 'phase' | 'on_demand'; phaseName: string | null }

export async function listChecklistTemplates(db: Db, actor: Actor): Promise<ChecklistTemplate[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ChecklistTemplate>(
      `select id, name, items, required, mode, phase_name as "phaseName" from checklist_template where org_id = $1 and archived_at is null order by position, name`,
      [actor.orgId],
    );
    return rows;
  });
}

const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(40),
  mode: z.enum(['daily', 'phase', 'on_demand']),
  phaseName: z.string().trim().max(120).nullable().optional(),
});

/** Creates or changes a checklist (owner, admin, engineer). */
export async function saveChecklistTemplate(db: Db, actor: Actor, id: string | null, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'projects.write');
  const data = parse(templateInput, input);
  if (data.mode === 'phase' && !data.phaseName) throw new DomainError('invalid_input', 422, { field: 'phaseName', detail: '' });
  return asActor(db, actor, async (tx) => {
    const values = [data.name, JSON.stringify(data.items), data.mode, data.mode === 'phase' ? data.phaseName : null, data.mode !== 'on_demand'];
    if (!id) {
      const { rows } = await tx.query<{ id: string }>(
        `insert into checklist_template (org_id, name, items, mode, phase_name, required, position)
         values ($1, $2, $3, $4, $5, $6, (select coalesce(max(position), 0) + 1 from checklist_template where org_id = $1)) returning id`,
        [actor.orgId, ...values]);
      await journal(tx, actor, 'checklist_template.create', rows[0]!.id, null, data);
      return { id: rows[0]!.id };
    }
    const before = (await tx.query('select * from checklist_template where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await tx.query('update checklist_template set name = $3, items = $4, mode = $5, phase_name = $6, required = $7 where id = $1 and org_id = $2', [id, actor.orgId, ...values]);
    await journal(tx, actor, 'checklist_template.update', id, before, data);
    return { id };
  });
}

export async function archiveChecklistTemplate(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'projects.write');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query('update checklist_template set archived_at = now() where id = $1 and org_id = $2 and archived_at is null', [id, actor.orgId]);
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'checklist_template.archive', id, null, null);
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
    const missed = data.items.filter((item) => !item.done);
    // Spec 048: on a quality check (tied to a phase, or done on demand, like receiving materials),
    // points not ticked are a non-conformity: an incident, and the task that clears it. A daily
    // routine left incomplete stays on record (journal, indicators) without raising an incident.
    const quality = data.templateId
      ? (await tx.query<{ mode: string }>('select mode from checklist_template where id = $1 and org_id = $2', [data.templateId, actor.orgId])).rows[0]?.mode !== 'daily'
      : false;
    if (created && missed.length && quality) {
      const incidentId = randomUUID();
      const description = `${data.name} : ${missed.map((item) => item.label).join(' ; ')}`.slice(0, 2000);
      await tx.query(
        `insert into incident (id, org_id, project_id, kind, priority, description, created_by) values ($1, $2, $3, 'defect', 'important', $4, $5)`,
        [incidentId, actor.orgId, data.projectId, description, actor.userId]);
      await tx.query(
        `insert into project_task (org_id, project_id, title, assignee_id, due_on, priority, incident_id, created_by)
         select $1, p.id, left($3, 200), p.manager_id, current_date + 3, 'normal', $4, $5 from project p where p.id = $2`,
        [actor.orgId, data.projectId, description, incidentId, actor.userId]);
      await journal(tx, actor, 'incident.report', incidentId, null, { from: 'checklist', checklistId: data.id });
    }
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
    // Timestamps leave the core as ISO strings (the driver gives Date objects).
    return rows.map((row) => ({ ...row, doneAt: new Date(row.doneAt as string | Date).toISOString() })) as {
      id: string; projectId: string; projectCode: string; projectName: string; name: string; items: { label: string; done: boolean; note?: string | null }[];
      doneCount: number; totalCount: number; completed: boolean; authorName: string; doneAt: string;
    }[];
  });
}
