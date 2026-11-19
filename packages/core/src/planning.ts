import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';

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
                         where m.project_id = p.id), '[]') as milestones
         from project p join project_progress pp on pp.project_id = p.id
        where p.org_id = $1 and p.archived_at is null and p.status <> 'done'
        order by p.start_date nulls last, p.code`,
      [actor.orgId],
    );
    return rows as {
      id: string; code: string; name: string; status: string; startDate: string | null; endDate: string | null;
      progressPct: number;
      milestones: { id: string; name: string; plannedOn: string; actualOn: string | null; status: string; delayDays: number; category: string }[];
    }[];
  });
}
