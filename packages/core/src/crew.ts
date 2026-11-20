import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { can } from './permissions.ts';

/**
 * Spec 047: who works on which site, and what it costs. Workers have no account; the site lead ticks
 * who is present in the day's report. A site's labour cost is presences × day rate (an estimate, the
 * pay itself stays with the accountant's tools). Day rates are pay: only `crew.rates` sees them.
 * Subcontractors are paid by the job; their payments are expenses of the site.
 */

export interface WorkerRow {
  id: string; name: string; trade: string | null; phone: string | null; dayRateMinor: number | null; active: boolean; note: string | null;
  daysLast30: number; lastSeen: string | null; lastSiteCode: string | null;
}

export async function listWorkers(db: Db, actor: Actor, filters: { activeOnly?: boolean } = {}): Promise<WorkerRow[]> {
  const rates = can(actor.role, 'crew.rates');
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<WorkerRow>(
      `select w.id, w.name, w.trade, w.phone, case when $3 then w.day_rate_minor::int end as "dayRateMinor", w.active, w.note,
              (select count(*)::int from worker_attendance a where a.worker_id = w.id and a.day > current_date - 30) as "daysLast30",
              to_char((select max(a.day) from worker_attendance a where a.worker_id = w.id), 'YYYY-MM-DD') as "lastSeen",
              (select p.code from worker_attendance a join project p on p.id = a.project_id where a.worker_id = w.id order by a.day desc, a.created_at desc limit 1) as "lastSiteCode"
         from worker w where w.org_id = $1 and (not $2 or w.active) order by w.active desc, w.name`,
      [actor.orgId, Boolean(filters.activeOnly), rates],
    );
    return rows;
  });
}

const workerInput = z.object({
  name: z.string().trim().min(1).max(120),
  trade: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  dayRateMinor: z.number().int().min(0).nullable().optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function saveWorker(db: Db, actor: Actor, id: string | null, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'crew.write');
  const sent = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
  const data = parse(id ? workerInput.partial() : workerInput, input) as z.infer<typeof workerInput>;
  if (sent.has('dayRateMinor') && !can(actor.role, 'crew.rates')) throw new DomainError('forbidden', 403);
  return asActor(db, actor, async (tx) => {
    if (!id) {
      if (!data.name) throw new DomainError('invalid_input', 422, { field: 'name', detail: '' });
      const { rows } = await tx.query<{ id: string }>(
        `insert into worker (org_id, name, trade, phone, day_rate_minor, note) values ($1, $2, $3, $4, $5, $6) returning id`,
        [actor.orgId, data.name, data.trade || null, data.phone || null, data.dayRateMinor ?? null, data.note || null]);
      await journal(tx, actor, 'worker.create', rows[0]!.id, null, { ...data, dayRateMinor: sent.has('dayRateMinor') ? 'set' : undefined });
      return { id: rows[0]!.id };
    }
    const columns: Record<string, string> = { name: 'name', trade: 'trade', phone: 'phone', dayRateMinor: 'day_rate_minor', active: 'active', note: 'note' };
    const entries = Object.entries(data).filter(([key]) => sent.has(key) && columns[key]);
    const before = (await tx.query('select * from worker where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    if (entries.length) {
      await tx.query(`update worker set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')} where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([, value]) => (value === '' ? null : value))]);
    }
    await journal(tx, actor, 'worker.update', id, { name: before.name }, Object.fromEntries(entries.map(([key, value]) => [key, key === 'dayRateMinor' ? 'set' : value])));
    return { id };
  });
}

async function assertWorkers(tx: Tx, orgId: string, ids: string[]) {
  if (!ids.length) return;
  const { rows } = await tx.query<{ n: number }>('select count(*)::int as n from worker where org_id = $1 and id = any($2::uuid[])', [orgId, ids]);
  if (rows[0]!.n !== new Set(ids).size) throw new DomainError('invalid_input', 422, { field: 'workerIds', detail: '' });
}

/**
 * Records who was present on a site on a day. Called with the day's report (the ids it carries are
 * added) or from the office to correct the list (`replace`: the day's list becomes exactly this one).
 */
export async function recordAttendance(
  db: Db, actor: Actor, input: { projectId: string; day: string; workerIds: string[]; reportId?: string | null; replace?: boolean },
  existingTx?: Tx,
): Promise<{ present: number }> {
  ensure(actor, 'field.report');
  const data = parse(z.object({
    projectId: z.string().uuid(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), workerIds: z.array(z.string().uuid()).max(300),
    reportId: z.string().uuid().nullable().optional(), replace: z.boolean().optional(),
  }), input);
  const work = async (tx: Tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    await assertWorkers(tx, actor.orgId, data.workerIds);
    if (data.replace) {
      await tx.query('delete from worker_attendance where org_id = $1 and project_id = $2 and day = $3 and not (worker_id = any($4::uuid[]))',
        [actor.orgId, data.projectId, data.day, data.workerIds]);
    }
    for (const workerId of new Set(data.workerIds)) {
      await tx.query(
        `insert into worker_attendance (org_id, project_id, worker_id, day, report_id, recorded_by) values ($1, $2, $3, $4, $5, $6)
         on conflict (project_id, worker_id, day) do nothing`,
        [actor.orgId, data.projectId, workerId, data.day, data.reportId ?? null, actor.userId]);
    }
    const { rows } = await tx.query<{ n: number }>('select count(*)::int as n from worker_attendance where project_id = $1 and day = $2', [data.projectId, data.day]);
    await journal(tx, actor, 'attendance.record', data.projectId, null, { day: data.day, workers: data.workerIds.length, replace: Boolean(data.replace) });
    return { present: rows[0]!.n };
  };
  return existingTx ? work(existingTx) : asActor(db, actor, work);
}

export interface AttendanceDay { projectId: string; projectCode: string; projectName: string; day: string; workers: { id: string; name: string; trade: string | null }[] }

/** Who was on which site, day by day, over a period (newest first). */
export async function listAttendance(db: Db, actor: Actor, filters: { from: string; to: string; projectId?: string }): Promise<AttendanceDay[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<AttendanceDay>(
      `select a.project_id as "projectId", p.code as "projectCode", p.name as "projectName", to_char(a.day, 'YYYY-MM-DD') as day,
              json_agg(json_build_object('id', w.id, 'name', w.name, 'trade', w.trade) order by w.name) as workers
         from worker_attendance a join project p on p.id = a.project_id join worker w on w.id = a.worker_id
        where a.org_id = $1 and a.day between $2 and $3 and ($4::uuid is null or a.project_id = $4)
        group by a.project_id, p.code, p.name, a.day order by a.day desc, p.code`,
      [actor.orgId, filters.from, filters.to, filters.projectId || null],
    );
    return rows;
  });
}

/** Today's crew: how many people on how many sites, and per site. */
export async function crewToday(db: Db, actor: Actor, day: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ projectId: string; code: string; workers: number }>(
      `select a.project_id as "projectId", p.code, count(*)::int as workers
         from worker_attendance a join project p on p.id = a.project_id
        where a.org_id = $1 and a.day = $2 group by a.project_id, p.code order by p.code`,
      [actor.orgId, day],
    );
    return { workers: rows.reduce((sum, row) => sum + row.workers, 0), sites: rows.length, perSite: rows };
  });
}

/** Labour of every site from presences (days, people, estimated cost when rates are visible). */
export async function labourByProject(db: Db, actor: Actor) {
  const rates = can(actor.role, 'crew.rates');
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ projectId: string; days: number; workers: number; costMinor: number | null; daysWithoutRate: number }>(
      `select project_id as "projectId", days, workers, case when $2 then cost_minor::float8 end as "costMinor", days_without_rate as "daysWithoutRate"
         from project_labour where org_id = $1`,
      [actor.orgId, rates],
    );
    return rows.map((row) => ({ ...row, costMinor: row.costMinor === null ? null : Number(row.costMinor) }));
  });
}

// ---------------------------------------------------------------- subcontracts

export interface SubcontractRow {
  id: string; projectId: string; projectCode: string; name: string; trade: string | null; phone: string | null;
  agreedMinor: number; progressPct: number; status: 'open' | 'closed'; note: string | null; paidMinor: number; dueMinor: number; currencyCode: string;
}

export async function listSubcontracts(db: Db, actor: Actor, filters: { projectId?: string } = {}): Promise<SubcontractRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<SubcontractRow>(
      `select s.id, s.project_id as "projectId", p.code as "projectCode", s.name, s.trade, s.phone, s.agreed_minor::float8 as "agreedMinor",
              s.progress_pct as "progressPct", s.status, s.note, p.currency_code as "currencyCode",
              coalesce(paid.total, 0)::float8 as "paidMinor",
              -- What the work done so far is worth, minus what was paid (never below zero).
              greatest(round(s.agreed_minor * s.progress_pct / 100.0) - coalesce(paid.total, 0), 0)::float8 as "dueMinor"
         from subcontract s join project p on p.id = s.project_id
         left join (select subcontract_id, sum(amount_minor) as total from expense where subcontract_id is not null group by subcontract_id) paid on paid.subcontract_id = s.id
        where s.org_id = $1 and ($2::uuid is null or s.project_id = $2) order by s.status, p.code, s.name`,
      [actor.orgId, filters.projectId || null],
    );
    return rows;
  });
}

const subcontractInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  trade: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  agreedMinor: z.number().int().positive(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function createSubcontract(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'crew.write');
  const data = parse(subcontractInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      `insert into subcontract (org_id, project_id, name, trade, phone, agreed_minor, note) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [actor.orgId, data.projectId, data.name, data.trade || null, data.phone || null, data.agreedMinor, data.note || null]);
    await journal(tx, actor, 'subcontract.create', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

export async function updateSubcontract(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'crew.write');
  const data = parse(z.object({ progressPct: z.number().int().min(0).max(100).optional(), status: z.enum(['open', 'closed']).optional(), agreedMinor: z.number().int().positive().optional() }), input);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from subcontract where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    const columns: Record<string, string> = { progressPct: 'progress_pct', status: 'status', agreedMinor: 'agreed_minor' };
    const entries = Object.entries(data).filter(([, value]) => value !== undefined);
    if (entries.length) {
      await tx.query(`update subcontract set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')} where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([, value]) => value)]);
    }
    await journal(tx, actor, 'subcontract.update', id, before, data);
  });
}

/** Pays a subcontractor: an expense of the site, category subcontracting, linked to the contract. */
export async function paySubcontract(db: Db, actor: Actor, id: string, input: unknown): Promise<{ expenseId: string }> {
  ensure(actor, 'expenses.write');
  const data = parse(z.object({ amountMinor: z.number().int().positive(), spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(), label: z.string().trim().max(200).optional() }), input);
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ project_id: string; name: string; currency: string }>(
      `select s.project_id, s.name, p.currency_code as currency from subcontract s join project p on p.id = s.project_id where s.id = $1 and s.org_id = $2`, [id, actor.orgId]);
    const contract = rows[0];
    if (!contract) throw notFound();
    const inserted = await tx.query<{ id: string }>(
      `insert into expense (org_id, project_id, spent_on, category, supplier, label, amount_minor, currency_code, created_by, subcontract_id)
       values ($1, $2, coalesce($3::date, current_date), 'subcontracting', $4, $5, $6, $7, $8, $9) returning id`,
      [actor.orgId, contract.project_id, data.spentOn ?? null, contract.name, data.label || contract.name, data.amountMinor, contract.currency, actor.userId, id]);
    await journal(tx, actor, 'subcontract.pay', id, null, { amountMinor: data.amountMinor, expenseId: inserted.rows[0]!.id });
    return { expenseId: inserted.rows[0]!.id };
  });
}
