import { z } from 'zod';
import { asActor, ensure, journal, orgToday, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { EXPENSE_CATEGORIES } from './expenses.ts';

/**
 * Spec 053: the money to come.
 *
 * Supplier bills to pay, with their due date; paid, a bill of a site becomes that site's expense.
 *
 * The cash forecast, week by week over 13 weeks, from what is recorded only:
 * - start: the company's bank balance on a day it gave (then moved by what was collected and spent
 *   since), else « collected − spent » since the beginning (marked as an estimate);
 * - money in: open invoices by their due date. Overdue invoices are NOT counted (shown apart: « if
 *   the late ones are paid »), so the forecast never relies on money that is already late;
 * - planned money in (an estimate, shown apart in each week): what is left to invoice on each active
 *   site (contract + accepted change orders − invoiced), spread evenly until the site's planned end,
 *   with VAT and retention, collected after the company's usual payment term;
 * - money out: supplier bills by their due date (late ones in the first week), labour at the pace of
 *   the last 4 weeks (presences × day rates, or labour expenses if higher), and the usual spending
 *   at the pace of the last 12 weeks (other expenses not coming from a supplier bill);
 * - subcontracts left to pay have no date: shown apart, not spread.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const num = (value: unknown) => Number(value ?? 0);

export interface SupplierBillRow {
  id: string; projectId: string | null; projectCode: string | null; supplier: string; label: string; reference: string | null; category: string;
  amountMinor: number; currency: string; issuedOn: string; dueOn: string; status: 'to_pay' | 'paid' | 'cancelled'; paidOn: string | null; overdueDays: number;
}

const billInput = z.object({
  projectId: z.string().uuid().nullable().optional(),
  supplier: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(120).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).default('materials'),
  amountMinor: z.number().int().positive(),
  issuedOn: day.optional(),
  dueOn: day,
});

export async function createSupplierBill(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'finance.write');
  const data = parse(billInput, input);
  return asActor(db, actor, async (tx) => {
    const currency = await currencyOf(tx, actor.orgId, data.projectId ?? null);
    // A bill entered late may already be due: without its issue date, it is taken as issued on its due
    // date (never later than today), so an overdue bill can still be recorded.
    const today = await orgToday(tx, actor.orgId);
    const issuedOn = data.issuedOn ?? (data.dueOn < today ? data.dueOn : today);
    if (data.dueOn < issuedOn) throw new DomainError('due_before_issue', 422);
    // The same supplier's bill entered twice would be paid twice in the cash forecast.
    if (data.reference) {
      const twin = await tx.query(
        `select 1 from supplier_bill where org_id = $1 and status <> 'cancelled' and lower(supplier) = lower($2) and lower(reference) = lower($3) limit 1`,
        [actor.orgId, data.supplier, data.reference]);
      if (twin.rowCount) throw new DomainError('bill_duplicate', 409, { reference: data.reference });
    }
    const { rows } = await tx.query<{ id: string }>(
      `insert into supplier_bill (org_id, project_id, supplier, label, reference, category, amount_minor, currency_code, issued_on, due_on, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::date, current_date), $10, $11) returning id`,
      [actor.orgId, data.projectId ?? null, data.supplier, data.label, data.reference || null, data.category, data.amountMinor, currency, issuedOn, data.dueOn, actor.userId]);
    await journal(tx, actor, 'bill.add', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

async function currencyOf(tx: Tx, orgId: string, projectId: string | null): Promise<string> {
  if (projectId) {
    const { rows } = await tx.query<{ currency: string }>('select currency_code as currency from project where id = $1 and org_id = $2', [projectId, orgId]);
    if (!rows[0]) throw notFound();
    return rows[0].currency;
  }
  const { rows } = await tx.query<{ currency: string }>('select currency_code as currency from org_settings where org_id = $1', [orgId]);
  return rows[0]?.currency ?? 'XOF';
}

export async function listSupplierBills(db: Db, actor: Actor, filters: { status?: 'to_pay' | 'paid' | 'cancelled'; projectId?: string } = {}): Promise<SupplierBillRow[]> {
  // The company's own money: the roles that see the Finance screen (not the site managers).
  ensure(actor, 'cash.read');
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<SupplierBillRow>(
      `select b.id, b.project_id as "projectId", p.code as "projectCode", b.supplier, b.label, b.reference, b.category, b.amount_minor::float8 as "amountMinor",
              b.currency_code as currency, to_char(b.issued_on, 'YYYY-MM-DD') as "issuedOn", to_char(b.due_on, 'YYYY-MM-DD') as "dueOn", b.status,
              to_char(b.paid_on, 'YYYY-MM-DD') as "paidOn", greatest(0, current_date - b.due_on)::int as "overdueDays"
         from supplier_bill b left join project p on p.id = b.project_id
        where b.org_id = $1 and ($2::text is null or b.status = $2) and ($3::uuid is null or b.project_id = $3)
        order by (b.status = 'to_pay') desc, b.due_on, b.created_at desc limit 200`,
      [actor.orgId, filters.status ?? null, filters.projectId ?? null]);
    return rows;
  });
}

/** Pays a bill: a bill of a site becomes that site's expense (so margins stay true). */
type BillToPay = { projectId: string | null; supplier: string; label: string; category: string; amount: number; currency: string; status: string };

/** The bill, locked, if it can be paid on that day (or today): it exists, is still to pay, and the day has come. */
async function billToPayTx(tx: Tx, actor: Actor, id: string, paidOnInput?: string): Promise<{ bill: BillToPay; paidOn: string }> {
  const { rows } = await tx.query<BillToPay>(
    `select project_id as "projectId", supplier, label, category, amount_minor::float8 as amount, currency_code as currency, status
       from supplier_bill where id = $1 and org_id = $2 for update`, [id, actor.orgId]);
  const bill = rows[0];
  if (!bill) throw notFound();
  if (bill.status !== 'to_pay') throw new DomainError('bill_closed', 409);
  // Paying records an expense: like any expense, on a day that has come.
  const today = await orgToday(tx, actor.orgId);
  const paidOn = paidOnInput ?? today;
  if (paidOn > today) throw new DomainError('spent_in_future', 422);
  return { bill, paidOn };
}

/** What would refuse paying this bill, checked without writing (the preview before the « yes »). */
export async function checkSupplierBillPayment(db: Db, actor: Actor, id: string, input: unknown = {}): Promise<{ paidOn: string }> {
  ensure(actor, 'finance.write');
  const data = parse(z.object({ paidOn: day.optional() }), input);
  return asActor(db, actor, async (tx) => ({ paidOn: (await billToPayTx(tx, actor, id, data.paidOn)).paidOn }));
}

export async function paySupplierBill(db: Db, actor: Actor, id: string, input: unknown = {}): Promise<{ expenseId: string | null }> {
  ensure(actor, 'finance.write');
  const data = parse(z.object({ paidOn: day.optional() }), input);
  return asActor(db, actor, async (tx) => {
    const { bill, paidOn } = await billToPayTx(tx, actor, id, data.paidOn);
    let expenseId: string | null = null;
    if (bill.projectId) {
      const expense = await tx.query<{ id: string }>(
        `insert into expense (org_id, project_id, spent_on, category, supplier, label, amount_minor, currency_code, created_by)
         values ($1, $2, coalesce($3::date, current_date), $4, $5, $6, $7, $8, $9) returning id`,
        [actor.orgId, bill.projectId, paidOn, bill.category, bill.supplier, bill.label, bill.amount, bill.currency, actor.userId]);
      expenseId = expense.rows[0]!.id;
    }
    await tx.query(`update supplier_bill set status = 'paid', paid_on = coalesce($3::date, current_date), expense_id = $4 where id = $1 and org_id = $2`,
      [id, actor.orgId, paidOn, expenseId]);
    await journal(tx, actor, 'bill.pay', id, null, { expenseId });
    return { expenseId };
  });
}

export async function cancelSupplierBill(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'finance.write');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(`update supplier_bill set status = 'cancelled' where id = $1 and org_id = $2 and status = 'to_pay'`, [id, actor.orgId]);
    if (!rowCount) throw new DomainError('bill_closed', 409);
    await journal(tx, actor, 'bill.cancel', id, null, null);
  });
}

/** The company's real bank balance on a day: the forecast starts from it. */
export async function setCashBalance(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'finance.write');
  const data = parse(z.object({ amountMinor: z.number().int(), on: day }), input);
  await asActor(db, actor, async (tx) => {
    await tx.query('update org_settings set cash_balance_minor = $2, cash_balance_on = $3 where org_id = $1', [actor.orgId, data.amountMinor, data.on]);
    await journal(tx, actor, 'cash.balance', actor.orgId, null, data);
  });
}

export interface CashWeek { from: string; to: string; inMinor: number; plannedInMinor: number; outMinor: number; billsMinor: number; balanceMinor: number }
export interface CashForecast {
  currency: string;
  start: { balanceMinor: number; on: string | null; estimated: boolean };
  weeks: CashWeek[];
  at: { d30: number; d60: number; d90: number };
  lowest: { balanceMinor: number; weekFrom: string };
  overdueInMinor: number;
  overdueBillsMinor: number;
  subcontractsLeftMinor: number;
  pace: { labourWeeklyMinor: number; spendingWeeklyMinor: number; paymentTermDays: number };
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The cash forecast over 13 weeks (see the rules above). */
export async function cashForecast(db: Db, actor: Actor, weeks = 13): Promise<CashForecast> {
  ensure(actor, 'cash.read');
  return asActor(db, actor, async (tx) => {
    const { rows: [settings] } = await tx.query<{ currency: string; balance: string | null; on: string | null }>(
      `select currency_code as currency, cash_balance_minor as balance, to_char(cash_balance_on, 'YYYY-MM-DD') as on from org_settings where org_id = $1`, [actor.orgId]);
    const currency = settings?.currency ?? 'XOF';
    const p = [actor.orgId, currency];
    const { rows: [base] } = await tx.query(
      `select
         (select coalesce(sum(amount_minor), 0) from payment where org_id = $1 and currency_code = $2 and ($3::date is null or received_on > $3))::float8 as collected,
         (select coalesce(sum(amount_minor), 0) from expense where org_id = $1 and currency_code = $2 and ($3::date is null or spent_on > $3) and spent_on <= current_date)::float8 as spent,
         (select coalesce(sum(balance_minor), 0) from invoice_balance where org_id = $1 and currency_code = $2 and balance_minor > 0 and due_on < current_date)::float8 as overdue_in,
         (select coalesce(sum(amount_minor), 0) from supplier_bill where org_id = $1 and currency_code = $2 and status = 'to_pay' and due_on < current_date)::float8 as overdue_bills,
         (select coalesce(sum(greatest(0, s.agreed_minor - coalesce((select sum(e.amount_minor) from expense e where e.subcontract_id = s.id), 0))), 0)
            from subcontract s join project pr on pr.id = s.project_id where s.org_id = $1 and s.status = 'open' and pr.currency_code = $2)::float8 as subcontracts_left,
         (select coalesce(sum(w.day_rate_minor), 0) from worker_attendance a join worker w on w.id = a.worker_id join project pr on pr.id = a.project_id
            where a.org_id = $1 and pr.currency_code = $2 and a.day > current_date - 28 and a.day <= current_date)::float8 / 4 as labour_presence,
         (select coalesce(sum(amount_minor), 0) from expense where org_id = $1 and currency_code = $2 and category = 'labour'
            and spent_on > current_date - 84 and spent_on <= current_date)::float8 / 12 as labour_expense,
         (select coalesce(sum(e.amount_minor), 0) from expense e where e.org_id = $1 and e.currency_code = $2 and e.category <> 'labour' and e.subcontract_id is null
            and not exists (select 1 from supplier_bill b where b.expense_id = e.id) and e.spent_on > current_date - 84 and e.spent_on <= current_date)::float8 / 12 as spending`,
      [...p, settings?.on ?? null]);
    const estimated = settings?.balance === null || settings?.balance === undefined;
    const startBalance = (estimated ? 0 : num(settings!.balance)) + num(base.collected) - num(base.spent);
    const labour = Math.round(Math.max(num(base.labour_presence), num(base.labour_expense)));
    const spending = Math.round(num(base.spending));
    const { rows: ins } = await tx.query<{ due: string; amount: number }>(
      `select to_char(due_on, 'YYYY-MM-DD') as due, sum(balance_minor)::float8 as amount from invoice_balance
        where org_id = $1 and currency_code = $2 and balance_minor > 0 and due_on >= current_date group by due_on`, p);
    const { rows: bills } = await tx.query<{ due: string; amount: number }>(
      `select to_char(greatest(due_on, current_date), 'YYYY-MM-DD') as due, sum(amount_minor)::float8 as amount from supplier_bill
        where org_id = $1 and currency_code = $2 and status = 'to_pay' group by greatest(due_on, current_date)`, p);
    // What is left to invoice on active sites, spread until their planned end (cash: with VAT, less retention).
    const { rows: sites } = await tx.query<{ left: number; weeks: number; factor: number; term: number }>(
      `select greatest(0, pr.budget_minor + coalesce((select sum(c.amount_minor) from change_order c where c.project_id = pr.id and c.status = 'accepted'), 0)
                  - coalesce((select sum(i.amount_minor) from invoice i where i.project_id = pr.id and i.status = 'issued'), 0))::float8 as left,
              greatest(1, ceil((pr.end_date - current_date) / 7.0))::int as weeks,
              ((10000 + s.vat_bps)::float8 / 10000) * ((10000 - s.retention_bps)::float8 / 10000) as factor,
              coalesce((select due_days from invoice_settings where org_id = pr.org_id), 30)::int as term
         from project pr join org_settings s on s.org_id = pr.org_id
        where pr.org_id = $1 and pr.currency_code = $2 and pr.status = 'active' and pr.archived_at is null and pr.end_date > current_date`, p);
    const term = sites[0]?.term ?? 30;
    const lag = Math.ceil(term / 7);
    const plannedAt = (week: number) => sites.reduce((sum, site) => {
      const billed = week - lag;
      return billed >= 0 && billed < site.weeks ? sum + (num(site.left) / site.weeks) * num(site.factor) : sum;
    }, 0);
    const today = new Date(`${iso(new Date())}T00:00:00Z`);
    const list: CashWeek[] = [];
    let balance = startBalance;
    for (let index = 0; index < weeks; index++) {
      const from = iso(new Date(today.getTime() + index * 7 * 86_400_000));
      const to = iso(new Date(today.getTime() + (index * 7 + 6) * 86_400_000));
      const inMinor = ins.filter((row) => row.due >= from && row.due <= to).reduce((sum, row) => sum + num(row.amount), 0);
      const billsMinor = bills.filter((row) => row.due >= from && row.due <= to).reduce((sum, row) => sum + num(row.amount), 0);
      const plannedInMinor = Math.round(plannedAt(index));
      const outMinor = billsMinor + labour + spending;
      balance += inMinor + plannedInMinor - outMinor;
      list.push({ from, to, inMinor, plannedInMinor, outMinor, billsMinor, balanceMinor: Math.round(balance) });
    }
    const after = (days: number) => list[Math.min(list.length - 1, Math.ceil(days / 7) - 1)]!.balanceMinor;
    const lowestWeek = list.reduce((low, week) => (week.balanceMinor < low.balanceMinor ? week : low), list[0]!);
    return {
      currency,
      start: { balanceMinor: Math.round(startBalance), on: settings?.on ?? null, estimated },
      weeks: list,
      at: { d30: after(30), d60: after(60), d90: after(90) },
      lowest: { balanceMinor: lowestWeek.balanceMinor, weekFrom: lowestWeek.from },
      overdueInMinor: num(base.overdue_in), overdueBillsMinor: num(base.overdue_bills), subcontractsLeftMinor: num(base.subcontracts_left),
      pace: { labourWeeklyMinor: labour, spendingWeeklyMinor: spending, paymentTermDays: term },
    };
  });
}
