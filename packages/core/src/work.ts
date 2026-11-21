import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { can } from './permissions.ts';

/**
 * Spec 046: the work a team shares on a site. Tasks are given to a person with a due date; whoever
 * may write projects creates and edits them, and the person it is given to moves it forward. The
 * internal thread is the team's own notes on a site, never shown to the client.
 */

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'urgent'] as const;

export interface TaskRow {
  id: string; projectId: string; projectCode: string; projectName: string; title: string; note: string | null;
  assigneeId: string | null; assigneeName: string | null; dueOn: string | null; priority: (typeof TASK_PRIORITIES)[number];
  status: (typeof TASK_STATUSES)[number]; late: boolean; createdAt: string; doneAt: string | null; createdByName: string;
  /** Spec 048: what the task serves in the planning, or the incident it clears. */
  milestoneId: string | null; milestoneName: string | null; phaseId: string | null; phaseName: string | null; incidentId: string | null;
}

export async function listTasks(db: Db, actor: Actor, filters: { projectId?: string; assigneeId?: string; open?: boolean } = {}): Promise<TaskRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<TaskRow>(
      `select t.id, t.project_id as "projectId", p.code as "projectCode", p.name as "projectName", t.title, t.note,
              t.assignee_id as "assigneeId", a.name as "assigneeName", to_char(t.due_on, 'YYYY-MM-DD') as "dueOn", t.priority, t.status,
              (t.status <> 'done' and t.due_on < current_date) as late, t.created_at as "createdAt", t.done_at as "doneAt",
              c.name as "createdByName", t.milestone_id as "milestoneId", m.name as "milestoneName",
              t.phase_id as "phaseId", ph.name as "phaseName", t.incident_id as "incidentId"
         from project_task t join project p on p.id = t.project_id
         left join "user" a on a.id = t.assignee_id join "user" c on c.id = t.created_by
         left join milestone m on m.id = t.milestone_id left join project_phase ph on ph.id = t.phase_id
        where t.org_id = $1 and p.archived_at is null
          and ($2::uuid is null or t.project_id = $2) and ($3::text is null or t.assignee_id = $3)
          and (not $4 or t.status <> 'done')
        order by case t.status when 'doing' then 0 when 'todo' then 1 else 2 end,
                 case t.priority when 'urgent' then 0 when 'normal' then 1 else 2 end,
                 t.due_on nulls last, t.created_at desc
        limit 500`,
      [actor.orgId, filters.projectId || null, filters.assigneeId || null, Boolean(filters.open)],
    );
    return rows;
  });
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const taskInput = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  dueOn: dateString.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  milestoneId: z.string().uuid().nullable().optional(),
  phaseId: z.string().uuid().nullable().optional(),
});

async function assertMember(tx: { query: Db['query'] }, orgId: string, userId: string | null | undefined) {
  if (!userId) return;
  const { rowCount } = await tx.query('select 1 from member where "organizationId" = $1 and "userId" = $2', [orgId, userId]);
  if (!rowCount) throw new DomainError('invalid_input', 422, { field: 'assigneeId', detail: '' });
}

/** A milestone or a phase given to a task must belong to the task's site. */
async function assertOfProject(tx: { query: Db['query'] }, projectId: string, milestoneId?: string | null, phaseId?: string | null) {
  if (milestoneId && !(await tx.query('select 1 from milestone where id = $1 and project_id = $2', [milestoneId, projectId])).rowCount) {
    throw new DomainError('invalid_input', 422, { field: 'milestoneId', detail: '' });
  }
  if (phaseId && !(await tx.query('select 1 from project_phase where id = $1 and project_id = $2', [phaseId, projectId])).rowCount) {
    throw new DomainError('invalid_input', 422, { field: 'phaseId', detail: '' });
  }
}

export async function createTask(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'projects.write');
  const data = parse(taskInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    await assertMember(tx, actor.orgId, data.assigneeId);
    await assertOfProject(tx, data.projectId, data.milestoneId, data.phaseId);
    const { rows } = await tx.query<{ id: string }>(
      `insert into project_task (org_id, project_id, title, note, assignee_id, due_on, priority, created_by, milestone_id, phase_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [actor.orgId, data.projectId, data.title, data.note ?? null, data.assigneeId ?? null, data.dueOn ?? null, data.priority, actor.userId,
        data.milestoneId ?? null, data.phaseId ?? null],
    );
    await journal(tx, actor, 'task.create', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

const taskPatch = taskInput.omit({ projectId: true }).partial().extend({ status: z.enum(TASK_STATUSES).optional() });

/** Edits a task; the person it is given to may only move its status. */
export async function updateTask(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  // Only the fields actually sent: the schema's defaults must not slip into a patch.
  const sent = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
  const data = Object.fromEntries(Object.entries(parse(taskPatch, input)).filter(([key]) => sent.has(key))) as z.infer<typeof taskPatch>;
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query<{ assignee_id: string | null; status: string }>('select * from project_task where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    const writer = can(actor.role, 'projects.write');
    const onlyStatus = Object.keys(data).every((key) => key === 'status');
    if (!writer && !(onlyStatus && before.assignee_id === actor.userId)) throw new DomainError('forbidden', 403);
    if (data.assigneeId !== undefined) await assertMember(tx, actor.orgId, data.assigneeId);
    await assertOfProject(tx, (before as unknown as { project_id: string }).project_id, data.milestoneId, data.phaseId);
    const columns: Record<string, string> = {
      title: 'title', note: 'note', assigneeId: 'assignee_id', dueOn: 'due_on', priority: 'priority', status: 'status', milestoneId: 'milestone_id', phaseId: 'phase_id',
    };
    const entries = Object.entries(data).filter(([key, value]) => value !== undefined && columns[key]);
    if (!entries.length) return;
    const doneAt = data.status === undefined ? '' : `, done_at = case when $${entries.length + 3} = 'done' then coalesce(done_at, now()) else null end`;
    await tx.query(
      `update project_task set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')}${doneAt}
        where id = $1 and org_id = $2`,
      [id, actor.orgId, ...entries.map(([, value]) => value), ...(data.status === undefined ? [] : [data.status])],
    );
    // Spec 048: finishing the task of an incident clears the incident (and reopening reopens it).
    if (data.status !== undefined) {
      await tx.query(
        `update incident set status = case $3 when 'done' then 'resolved' when 'doing' then 'in_progress' else 'open' end,
                resolved_at = case when $3 = 'done' then coalesce(resolved_at, now()) else null end
          where org_id = $2 and id = (select incident_id from project_task where id = $1)
            and status <> case $3 when 'done' then 'resolved' when 'doing' then 'in_progress' else 'open' end`, [id, actor.orgId, data.status]);
    }
    await journal(tx, actor, 'task.update', id, before, Object.fromEntries(entries));
  });
}

export async function removeTask(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'projects.write');
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('delete from project_task where id = $1 and org_id = $2 returning *', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await journal(tx, actor, 'task.remove', id, before, null);
  });
}

// ---------------------------------------------------------------- internal thread

export interface NoteRow { id: string; authorId: string; authorName: string; body: string; createdAt: string }

export async function listNotes(db: Db, actor: Actor, projectId: string): Promise<NoteRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<NoteRow>(
      `select n.id, n.author_id as "authorId", u.name as "authorName", n.body, n.created_at as "createdAt"
         from project_note n join "user" u on u.id = n.author_id
        where n.org_id = $1 and n.project_id = $2 order by n.created_at desc limit 200`,
      [actor.orgId, projectId],
    );
    return rows;
  });
}

/** Any member of the company may write in a site's internal thread. */
export async function postNote(db: Db, actor: Actor, input: unknown): Promise<{ id: string; created: boolean }> {
  // Spec 052: a note written in the field carries its own id (sent twice from the outbox, kept once).
  const data = parse(z.object({ id: z.string().uuid().optional(), projectId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }), input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      'insert into project_note (id, org_id, project_id, author_id, body) values (coalesce($5::uuid, gen_random_uuid()), $1, $2, $3, $4) on conflict (id) do nothing returning id',
      [actor.orgId, data.projectId, actor.userId, data.body, data.id ?? null],
    );
    if (!rows[0]) return { id: data.id!, created: false };
    await journal(tx, actor, 'note.post', rows[0].id, null, { projectId: data.projectId });
    return { id: rows[0].id, created: true };
  });
}

// ---------------------------------------------------------------- document versions

export interface DocumentVersionRow { id: string; mediaType: string | null; sizeBytes: number | null; replacedAt: string; replacedByName: string | null }

export async function listDocumentVersions(db: Db, actor: Actor, documentId: string): Promise<DocumentVersionRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<DocumentVersionRow>(
      `select v.id, v.media_type as "mediaType", v.size_bytes::int as "sizeBytes", v.replaced_at as "replacedAt", u.name as "replacedByName"
         from document_version v left join "user" u on u.id = v.replaced_by
        where v.org_id = $1 and v.document_id = $2 order by v.replaced_at desc`,
      [actor.orgId, documentId],
    );
    return rows;
  });
}

export async function documentVersionFile(db: Db, actor: Actor, documentId: string, versionId: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ storageKey: string; mediaType: string | null; title: string }>(
      `select v.storage_key as "storageKey", v.media_type as "mediaType", d.title
         from document_version v join project_document d on d.id = v.document_id
        where v.id = $1 and v.document_id = $2 and v.org_id = $3`,
      [versionId, documentId, actor.orgId],
    );
    return rows[0] ?? null;
  });
}
