import { z } from 'zod';
import { asActor, ensure, journal, orgToday, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';

export const MILESTONE_CATEGORIES = ['admin', 'studies', 'technical', 'finishing', 'delivery'] as const;

export interface MilestoneRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  name: string;
  category: string;
  plannedOn: string;
  actualOn: string | null;
  status: 'done' | 'late' | 'pending';
  delayDays: number;
  note: string | null;
  action: string | null;
  priority: string;
  clientValidation: boolean;
  clientValidatedAt: string | null;
}

export async function listMilestones(db: Db, actor: Actor, filters: { projectId?: string; late?: boolean } = {}): Promise<MilestoneRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<MilestoneRow>(
      `select m.id, m.project_id as "projectId", p.code as "projectCode", p.name as "projectName", m.name, m.category,
              m.planned_on as "plannedOn", m.actual_on as "actualOn", ms.status, ms.delay_days as "delayDays", m.note,
              m.action, m.priority, m.client_validation as "clientValidation", m.client_validated_at as "clientValidatedAt"
         from milestone m join milestone_status ms on ms.milestone_id = m.id join project p on p.id = m.project_id
        where m.org_id = $1 and p.archived_at is null and ($2::uuid is null or m.project_id = $2)
          and (not $3 or ms.status = 'late')
        order by m.planned_on, m.position`,
      [actor.orgId, filters.projectId || null, filters.late ?? false],
    );
    return rows;
  });
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const milestoneInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(MILESTONE_CATEGORIES).default('technical'),
  plannedOn: dateString,
  actualOn: dateString.nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  action: z.string().trim().max(500).nullable().optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  clientValidation: z.boolean().default(false),
});

export async function addMilestone(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'planning.write');
  const data = parse(milestoneInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    if (data.actualOn && data.actualOn > await orgToday(tx, actor.orgId)) throw new DomainError('reached_in_future', 422);
    const { rows } = await tx.query<{ id: string }>(
      `insert into milestone (org_id, project_id, name, category, planned_on, actual_on, note, action, priority, client_validation, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               (select coalesce(max(position), 0) + 1 from milestone where project_id = $2)) returning id`,
      [actor.orgId, data.projectId, data.name, data.category, data.plannedOn, data.actualOn ?? null, data.note ?? null,
        data.action ?? null, data.priority, data.clientValidation],
    );
    await journal(tx, actor, 'milestone.add', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

const milestonePatch = milestoneInput.omit({ projectId: true }).partial();

export async function updateMilestone(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'planning.write');
  const data = parse(milestonePatch, input);
  const raw = (input ?? {}) as Record<string, unknown>;
  const columns: Record<string, string> = {
    name: 'name', category: 'category', plannedOn: 'planned_on', actualOn: 'actual_on', note: 'note', action: 'action',
    priority: 'priority', clientValidation: 'client_validation',
  };
  const entries = Object.entries(data).filter(([key, value]) => value !== undefined && key in raw && columns[key]);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from milestone where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    if (data.actualOn && 'actualOn' in raw) await ensureReachable(tx, actor.orgId, id, data.actualOn);
    // Back to « not reached » only while nothing waiting for it is reached: the order stays true.
    if (data.actualOn === null && 'actualOn' in raw && before.actual_on) {
      const { rows } = await tx.query<{ name: string }>(
        `select m.name from milestone_dependency d join milestone m on m.id = d.milestone_id
          where d.org_id = $1 and d.depends_on_id = $2 and m.actual_on is not null order by m.planned_on`, [actor.orgId, id]);
      if (rows.length) throw new DomainError('successors_reached', 409, { reached: rows.map((row) => row.name).join(', ') });
    }
    if (entries.length) {
      await tx.query(
        `update milestone set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')}
          where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([, value]) => value)],
      );
    }
    await journal(tx, actor, 'milestone.update', id, before, Object.fromEntries(entries));
  });
}

/**
 * A milestone is reached on a day that has come, and only once every milestone it waits for is
 * reached: the reception cannot be done while the foundations are still ahead.
 */
async function ensureReachable(tx: Tx, orgId: string, id: string, actualOn: string): Promise<void> {
  if (actualOn > await orgToday(tx, orgId)) throw new DomainError('reached_in_future', 422);
  const { rows } = await tx.query<{ name: string }>(
    `select p.name from milestone_dependency d join milestone p on p.id = d.depends_on_id
      where d.org_id = $1 and d.milestone_id = $2 and p.actual_on is null order by p.planned_on`,
    [orgId, id],
  );
  if (rows.length) throw new DomainError('predecessors_pending', 409, { pending: rows.map((row) => row.name).join(', ') });
}

/** What would refuse marking this milestone reached, checked without writing (for a preview). */
export async function checkMilestoneReachable(db: Db, actor: Actor, id: string, input: { actualOn?: string } = {}): Promise<void> {
  ensure(actor, 'planning.write');
  await asActor(db, actor, async (tx) => {
    const found = await tx.query('select 1 from milestone where id = $1 and org_id = $2', [id, actor.orgId]);
    if (!found.rowCount) throw notFound();
    await ensureReachable(tx, actor.orgId, id, input.actualOn ?? await orgToday(tx, actor.orgId));
  });
}

/** Marks a milestone reached, on the given day or today in the company's time zone. */
export async function markMilestoneReached(db: Db, actor: Actor, id: string, input: { actualOn?: string } = {}): Promise<{ actualOn: string }> {
  const actualOn = input.actualOn ?? await asActor(db, actor, (tx) => orgToday(tx, actor.orgId));
  await updateMilestone(db, actor, id, { actualOn });
  return { actualOn };
}

export async function removeMilestone(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'planning.write');
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('delete from milestone where id = $1 and org_id = $2 returning *', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await journal(tx, actor, 'milestone.remove', id, before, null);
  });
}

/** The consolidated Gantt: each open project's span and its milestones. */
export async function gantt(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id, p.code, p.name, p.status, p.start_date as "startDate", p.end_date as "endDate",
              pp.progress_pct as "progressPct",
              coalesce((select json_agg(json_build_object('id', m.id, 'name', m.name, 'plannedOn', m.planned_on,
                                                          'actualOn', m.actual_on, 'status', ms.status,
                                                          'delayDays', ms.delay_days, 'category', m.category)
                                        order by m.planned_on)
                          from milestone m join milestone_status ms on ms.milestone_id = m.id
                         where m.project_id = p.id), '[]') as milestones,
              coalesce((select json_agg(json_build_object('id', x.id, 'name', x.name, 'startDate', x.start_date, 'endDate', x.end_date,
                                                          'progress', x.progress_pct) order by x.position)
                          from project_phase x where x.project_id = p.id), '[]') as phases
         from project p join project_progress pp on pp.project_id = p.id
        where p.org_id = $1 and p.archived_at is null and p.status <> 'done'
        order by p.start_date nulls last, p.code`,
      [actor.orgId],
    );
    const deps = await tx.query<MilestoneDependency>(
      `select d.milestone_id as "milestoneId", d.depends_on_id as "dependsOnId", d.lag_days as "lagDays"
         from milestone_dependency d where d.org_id = $1`,
      [actor.orgId],
    );
    return {
      sites: rows as {
        id: string; code: string; name: string; status: string; startDate: string | null; endDate: string | null;
        progressPct: number;
        milestones: { id: string; name: string; plannedOn: string; actualOn: string | null; status: string; delayDays: number; category: string }[];
        phases: { id: string; name: string; startDate: string | null; endDate: string | null; progress: number }[];
      }[],
      dependencies: deps.rows,
    };
  });
}

// ---------------------------------------------------------------- dependencies (spec 031)

export interface MilestoneDependency { milestoneId: string; dependsOnId: string; lagDays: number }

const dependenciesInput = z.object({
  dependsOn: z.array(z.object({ id: z.string().uuid(), lagDays: z.number().int().min(0).max(365).default(0) })).max(20),
});

/**
 * Says which milestones this one waits for (replaces the list). A predecessor may belong to another
 * site of the company. A loop (A waits for B which waits for A, at any depth) is refused.
 */
export async function setMilestoneDependencies(db: Db, actor: Actor, milestoneId: string, input: unknown): Promise<void> {
  ensure(actor, 'planning.write');
  const data = parse(dependenciesInput, input);
  const unique = data.dependsOn.filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index);
  const ids = unique.map((item) => item.id);
  if (ids.includes(milestoneId)) throw new DomainError('dependency_cycle', 422);
  await asActor(db, actor, async (tx) => {
    const found = await tx.query('select id from milestone where org_id = $1 and id = any($2::uuid[])', [actor.orgId, [milestoneId, ...ids]]);
    if (found.rowCount !== ids.length + 1) throw notFound();
    if (ids.length) {
      // Does any chosen predecessor already wait, directly or not, for this milestone?
      const loop = await tx.query(
        `with recursive up(id) as (
           select unnest($2::uuid[])
           union
           select d.depends_on_id from milestone_dependency d join up on d.milestone_id = up.id where d.org_id = $1)
         select 1 from up where id = $3 limit 1`,
        [actor.orgId, ids, milestoneId],
      );
      if (loop.rowCount) throw new DomainError('dependency_cycle', 422);
    }
    const before = (await tx.query('select depends_on_id, lag_days from milestone_dependency where milestone_id = $1 and org_id = $2', [milestoneId, actor.orgId])).rows;
    await tx.query('delete from milestone_dependency where milestone_id = $1 and org_id = $2', [milestoneId, actor.orgId]);
    for (const item of unique) {
      await tx.query('insert into milestone_dependency (org_id, milestone_id, depends_on_id, lag_days) values ($1, $2, $3, $4)',
        [actor.orgId, milestoneId, item.id, item.lagDays]);
    }
    await journal(tx, actor, 'milestone.dependencies', milestoneId, before, data);
  });
}

export interface ShiftedMilestone { id: string; name: string; from: string; to: string }

/**
 * Pushes the milestones that wait for `startId` (and those that wait for them…) so each stays after all
 * its predecessors plus their lag. Only later: a milestone already further away keeps its date, and a
 * milestone already reached never moves. Returns what moved, with former dates, for « undo ».
 */
async function pushSuccessors(tx: Tx, orgId: string, startId: string): Promise<ShiftedMilestone[]> {
  const shifted: ShiftedMilestone[] = [];
  const queue = [startId];
  for (let guard = 0; queue.length && guard < 500; guard += 1) {
    const current = queue.shift()!;
    const { rows } = await tx.query<{ id: string; name: string; planned: string; required: string }>(
      `select m.id, m.name, to_char(m.planned_on, 'YYYY-MM-DD') as planned,
              to_char(max(coalesce(p.actual_on, p.planned_on) + d2.lag_days), 'YYYY-MM-DD') as required
         from milestone_dependency d
         join milestone m on m.id = d.milestone_id
         join milestone_dependency d2 on d2.milestone_id = m.id
         join milestone p on p.id = d2.depends_on_id
        where d.org_id = $1 and d.depends_on_id = $2 and m.actual_on is null
        group by m.id, m.name, m.planned_on`,
      [orgId, current],
    );
    for (const row of rows) {
      if (row.required <= row.planned) continue;
      await tx.query('update milestone set planned_on = $3 where id = $1 and org_id = $2', [row.id, orgId, row.required]);
      const known = shifted.find((item) => item.id === row.id);
      if (known) known.to = row.required; else shifted.push({ id: row.id, name: row.name, from: row.planned, to: row.required });
      queue.push(row.id);
    }
  }
  return shifted;
}

/**
 * Moves a milestone to a new planned date and pushes what waits for it (spec 031). The answer lists
 * the milestones moved in cascade, with their former dates.
 */
export interface BeyondSiteEnd { id: string; name: string; plannedOn: string; siteCode: string; siteEnd: string }

export async function moveMilestone(db: Db, actor: Actor, id: string, input: unknown): Promise<{ shifted: ShiftedMilestone[]; beyondSiteEnd: BeyondSiteEnd[] }> {
  ensure(actor, 'planning.write');
  const data = parse(z.object({ plannedOn: dateString }), input);
  return asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from milestone where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    if (before.actual_on) throw new DomainError('already_validated', 409);
    await tx.query('update milestone set planned_on = $3 where id = $1 and org_id = $2', [id, actor.orgId, data.plannedOn]);
    const shifted = await pushSuccessors(tx, actor.orgId, id);
    await journal(tx, actor, 'milestone.move', id, before, { ...data, shifted: shifted.length });
    // The move is kept, but what now falls after its site's planned end is said, not hidden.
    const { rows: beyondSiteEnd } = await tx.query<BeyondSiteEnd>(
      `select m.id, m.name, to_char(m.planned_on, 'YYYY-MM-DD') as "plannedOn", p.code as "siteCode",
              to_char(p.end_date, 'YYYY-MM-DD') as "siteEnd"
         from milestone m join project p on p.id = m.project_id
        where m.org_id = $1 and m.id = any($2::uuid[]) and p.end_date is not null and m.planned_on > p.end_date
        order by m.planned_on`,
      [actor.orgId, [id, ...shifted.map((item) => item.id)]],
    );
    return { shifted, beyondSiteEnd };
  });
}

/** Puts milestones back on given dates without pushing anything (the « undo » of a move). */
export async function restoreMilestoneDates(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'planning.write');
  const data = parse(z.object({ items: z.array(z.object({ id: z.string().uuid(), plannedOn: dateString })).min(1).max(500) }), input);
  await asActor(db, actor, async (tx) => {
    for (const item of data.items) {
      await tx.query('update milestone set planned_on = $3 where id = $1 and org_id = $2', [item.id, actor.orgId, item.plannedOn]);
    }
    await journal(tx, actor, 'milestone.restore', actor.orgId, null, { count: data.items.length });
  });
}

