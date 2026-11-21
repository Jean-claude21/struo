import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { createInvoice } from './finance.ts';
import { hashToken } from './portal.ts';

/**
 * Spec 048: change orders (avenants). Extra or changed work with a price and the days it adds; the
 * office drafts it, sends it to the client's space, the client accepts or refuses it there (named,
 * journaled), and an accepted one is invoiced. The contract value is the budget plus accepted ones.
 */

export interface ChangeOrderRow {
  id: string; projectId: string; number: number; title: string; description: string | null; amountMinor: number; daysAdded: number;
  status: 'draft' | 'sent' | 'accepted' | 'refused'; sentAt: string | null; decidedAt: string | null; decidedBy: string | null; invoiceId: string | null;
}

const COLUMNS = `id, project_id as "projectId", number, title, description, amount_minor::float8 as "amountMinor", days_added as "daysAdded",
  status, sent_at as "sentAt", decided_at as "decidedAt", decided_by as "decidedBy", invoice_id as "invoiceId"`;

const writer = (actor: Actor) => {
  if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'engineer' && actor.role !== 'accountant') throw new DomainError('forbidden', 403);
};

export async function listChangeOrders(db: Db, actor: Actor, projectId: string): Promise<ChangeOrderRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ChangeOrderRow>(`select ${COLUMNS} from change_order where org_id = $1 and project_id = $2 order by number`, [actor.orgId, projectId]);
    return rows;
  });
}

/** Budget, accepted change orders and the resulting contract value of a site. */
export async function contractValue(db: Db, actor: Actor, projectId: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ budget: number; accepted: number; pending: number; days: number }>(
      `select p.budget_minor::float8 as budget,
              coalesce(sum(c.amount_minor) filter (where c.status = 'accepted'), 0)::float8 as accepted,
              coalesce(sum(c.amount_minor) filter (where c.status = 'sent'), 0)::float8 as pending,
              coalesce(sum(c.days_added) filter (where c.status = 'accepted'), 0)::int as days
         from project p left join change_order c on c.project_id = p.id where p.id = $1 and p.org_id = $2 group by p.id`,
      [projectId, actor.orgId]);
    const row = rows[0];
    if (!row) throw notFound();
    return { budgetMinor: row.budget, acceptedMinor: row.accepted, pendingMinor: row.pending, daysAdded: row.days, totalMinor: row.budget + row.accepted };
  });
}

const changeInput = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  amountMinor: z.number().int().positive(),
  daysAdded: z.number().int().min(0).max(3650).default(0),
});

export async function createChangeOrder(db: Db, actor: Actor, input: unknown): Promise<{ id: string; number: number }> {
  writer(actor);
  const data = parse(changeInput, input);
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2 for update', [data.projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string; number: number }>(
      `insert into change_order (org_id, project_id, number, title, description, amount_minor, days_added, created_by)
       values ($1, $2, (select coalesce(max(number), 0) + 1 from change_order where project_id = $2), $3, $4, $5, $6, $7) returning id, number`,
      [actor.orgId, data.projectId, data.title, data.description || null, data.amountMinor, data.daysAdded, actor.userId]);
    await journal(tx, actor, 'change_order.create', rows[0]!.id, null, data);
    return rows[0]!;
  });
}

/** Sends a draft to the client's space, where they accept or refuse it. */
export async function sendChangeOrder(db: Db, actor: Actor, id: string): Promise<void> {
  writer(actor);
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(`update change_order set status = 'sent', sent_at = now() where id = $1 and org_id = $2 and status = 'draft'`, [id, actor.orgId]);
    if (!rowCount) throw new DomainError('invalid_state', 409);
    await journal(tx, actor, 'change_order.send', id, null, null);
  });
}

/**
 * The client's answer given to the office in person or in writing: recorded with the name of who
 * decided, like an answer from the portal.
 */
export async function decideChangeOrder(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  writer(actor);
  const data = parse(z.object({ accept: z.boolean(), decidedBy: z.string().trim().min(1).max(120) }), input);
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(
      `update change_order set status = $3, decided_at = now(), decided_by = $4 where id = $1 and org_id = $2 and status in ('draft', 'sent')`,
      [id, actor.orgId, data.accept ? 'accepted' : 'refused', data.decidedBy]);
    if (!rowCount) throw new DomainError('invalid_state', 409);
    await journal(tx, actor, data.accept ? 'change_order.accept' : 'change_order.refuse', id, null, data);
  });
}

/** Invoices an accepted change order once (a « progress » invoice labelled with its number). */
export async function invoiceChangeOrder(db: Db, actor: Actor, id: string, dueOn: string, label: (number: number, title: string) => string): Promise<{ invoiceId: string }> {
  ensure(actor, 'finance.write');
  const order = (await listChangeOrderById(db, actor, id));
  if (order.status !== 'accepted' || order.invoiceId) throw new DomainError('invalid_state', 409);
  const invoice = await createInvoice(db, actor, { projectId: order.projectId, kind: 'progress', label: label(order.number, order.title).slice(0, 200), amountMinor: order.amountMinor, dueOn });
  await asActor(db, actor, async (tx) => {
    await tx.query('update change_order set invoice_id = $3 where id = $1 and org_id = $2', [id, actor.orgId, invoice.id]);
    await journal(tx, actor, 'change_order.invoice', id, null, { invoiceId: invoice.id });
  });
  return { invoiceId: invoice.id };
}

async function listChangeOrderById(db: Db, actor: Actor, id: string): Promise<ChangeOrderRow> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ChangeOrderRow>(`select ${COLUMNS} from change_order where id = $1 and org_id = $2`, [id, actor.orgId]);
    if (!rows[0]) throw notFound();
    return rows[0];
  });
}

// ---------------------------------------------------------------- the client's side (portal)

export interface PortalChangeOrder { id: string; number: number; title: string; description: string | null; amountMinor: number; daysAdded: number; status: string; decidedAt: string | null; decidedBy: string | null }

export async function portalChangeOrders(db: Db, token: string): Promise<PortalChangeOrder[]> {
  const { rows } = await db.query<{ orders: PortalChangeOrder[] }>('select struo_portal_change_orders($1) as orders', [hashToken(token)]);
  return rows[0]?.orders ?? [];
}

export async function portalDecideChangeOrder(db: Db, token: string, input: unknown): Promise<boolean> {
  const data = parse(z.object({ id: z.string().uuid(), accept: z.boolean(), signer: z.string().trim().min(1).max(120) }), input);
  try {
    const { rows } = await db.query<{ done: boolean }>('select struo_portal_decide_change_order($1, $2, $3, $4) as done', [hashToken(token), data.id, data.accept, data.signer]);
    return Boolean(rows[0]?.done);
  } catch (error) {
    if (String((error as Error).message).includes('portal_link_invalid')) throw new DomainError('portal_link_invalid', 404);
    throw error;
  }
}

// ---------------------------------------------------------------- the day's journal (spec 048)

/**
 * Everything that happened on a site on one day, read from what is already recorded: reports with
 * their photos, who was present, deliveries, incidents raised, checklists done. Nothing to type.
 */
export async function siteDay(db: Db, actor: Actor, projectId: string, day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new DomainError('invalid_input', 422, { field: 'day', detail: '' });
  return asActor(db, actor, async (tx) => {
    const project = (await tx.query<{ code: string; name: string; location: string | null; manager: string | null }>(
      `select p.code, p.name, p.location, u.name as manager from project p left join "user" u on u.id = p.manager_id where p.id = $1 and p.org_id = $2`,
      [projectId, actor.orgId])).rows[0];
    if (!project) throw notFound();
    const local = `(($1::timestamptz) at time zone coalesce((select time_zone from org_settings where org_id = $2), 'UTC'))::date`;
    const [reports, presences, deliveries, incidents, checklists] = await Promise.all([
      tx.query<{ id: string; takenAt: string; author: string; phase: string | null; progressPct: number | null; note: string | null; status: string; photos: string[] }>(
        `select r.id, r.taken_at as "takenAt", u.name as author, ph.name as phase, r.progress_pct as "progressPct", r.note, r.status,
                coalesce((select json_agg(x.id order by x.taken_at) from report_photo x where x.report_id = r.id), '[]') as photos
           from site_report r join "user" u on u.id = r.author_id left join project_phase ph on ph.id = r.phase_id
          where r.project_id = $3 and r.org_id = $2 and ${local.replace('$1::timestamptz', 'r.taken_at')} = $1::date order by r.taken_at`,
        [day, actor.orgId, projectId]),
      tx.query<{ name: string; trade: string | null }>(
        `select w.name, w.trade from worker_attendance a join worker w on w.id = a.worker_id where a.project_id = $1 and a.org_id = $2 and a.day = $3 order by w.name`,
        [projectId, actor.orgId, day]),
      tx.query<{ item: string; quantity: string | null; unit: string | null; supplier: string | null; verdict: string }>(
        `select item, quantity::text, unit, supplier, verdict from delivery where project_id = $1 and org_id = $2 and delivered_on = $3 order by created_at`,
        [projectId, actor.orgId, day]),
      tx.query<{ kind: string; priority: string; description: string; status: string }>(
        `select kind, priority, description, status from incident where project_id = $3 and org_id = $2 and ${local.replace('$1::timestamptz', 'created_at')} = $1::date order by created_at`,
        [day, actor.orgId, projectId]),
      tx.query<{ name: string; doneCount: number; totalCount: number; completed: boolean }>(
        `select name, done_count as "doneCount", total_count as "totalCount", completed from checklist_run
          where project_id = $3 and org_id = $2 and ${local.replace('$1::timestamptz', 'done_at')} = $1::date order by done_at`,
        [day, actor.orgId, projectId]),
    ]);
    return { day, project, reports: reports.rows, presences: presences.rows, deliveries: deliveries.rows, incidents: incidents.rows, checklists: checklists.rows };
  });
}
