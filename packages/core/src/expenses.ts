import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';

export const EXPENSE_CATEGORIES = ['materials', 'labour', 'subcontracting', 'equipment', 'transport', 'fees', 'other'] as const;

const expenseInput = z.object({
  projectId: z.string().uuid(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  supplier: z.string().trim().max(200).nullable().optional(),
  label: z.string().trim().min(1).max(200),
  amountMinor: z.number().int().positive(),
});

export async function addExpense(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'expenses.write');
  const data = parse(expenseInput, input);
  return asActor(db, actor, async (tx) => {
    const project = (
      await tx.query<{ currency: string }>('select currency_code as currency from project where id = $1 and org_id = $2', [data.projectId, actor.orgId])
    ).rows[0];
    if (!project) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      `insert into expense (org_id, project_id, spent_on, category, supplier, label, amount_minor, currency_code, created_by)
       values ($1, $2, coalesce($3::date, current_date), $4, $5, $6, $7, $8, $9) returning id`,
      [actor.orgId, data.projectId, data.spentOn ?? null, data.category, data.supplier ?? null, data.label,
        data.amountMinor, project.currency, actor.userId],
    );
    await journal(tx, actor, 'expense.add', rows[0]!.id, null, data);
    return { id: rows[0]!.id };
  });
}

export async function removeExpense(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'expenses.write');
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('delete from expense where id = $1 and org_id = $2 returning *', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await journal(tx, actor, 'expense.remove', id, before, null);
  });
}

export async function listExpenses(db: Db, actor: Actor, filters: { projectId?: string; limit?: number } = {}) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select e.id, e.project_id as "projectId", p.code as "projectCode", p.name as "projectName", e.spent_on as "spentOn",
              e.category, e.supplier, e.label, e.amount_minor as "amountMinor", e.currency_code as "currencyCode"
         from expense e join project p on p.id = e.project_id
        where e.org_id = $1 and ($2::uuid is null or e.project_id = $2)
        order by e.spent_on desc, e.created_at desc limit $3`,
      [actor.orgId, filters.projectId || null, Math.min(filters.limit ?? 200, 1000)],
    );
    return rows as {
      id: string; projectId: string; projectCode: string; projectName: string; spentOn: string; category: string;
      supplier: string | null; label: string; amountMinor: number; currencyCode: string;
    }[];
  });
}

/**
 * Margin per project: what was collected and invoiced against what was spent, and the cost
 * performance (budget share of progress over real cost). All figures from the database.
 */
export async function marginByProject(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select p.id as "projectId", p.code, p.name, t.name as "typeName", f.budget_minor as "budgetMinor",
              f.invoiced_minor as "invoicedMinor", f.collected_minor as "collectedMinor", f.spent_minor as "spentMinor",
              f.progress_pct as "progressPct",
              (f.invoiced_minor - f.spent_minor)::bigint as "marginMinor",
              case when f.invoiced_minor > 0
                   then round((f.invoiced_minor - f.spent_minor)::numeric * 100 / f.invoiced_minor)::int end as "marginPct",
              case when f.spent_minor > 0 and f.budget_minor > 0
                   then round(f.budget_minor::numeric * f.progress_pct / 100 / f.spent_minor, 2) end as cpi
         from project p join project_finance f on f.project_id = p.id left join project_type t on t.id = p.type_id
        where p.org_id = $1 and p.archived_at is null order by p.code`,
      [actor.orgId],
    );
    return rows as {
      projectId: string; code: string; name: string; typeName: string | null; budgetMinor: number; invoicedMinor: number;
      collectedMinor: number; spentMinor: number; progressPct: number; marginMinor: number; marginPct: number | null;
      cpi: number | null;
    }[];
  });
}

/** Profitability per segment (project type). */
export async function marginBySegment(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select coalesce(t.name, '—') as segment, count(*)::int as projects,
              sum(f.invoiced_minor)::bigint as "invoicedMinor", sum(f.spent_minor)::bigint as "spentMinor",
              (sum(f.invoiced_minor) - sum(f.spent_minor))::bigint as "marginMinor",
              case when sum(f.invoiced_minor) > 0
                   then round((sum(f.invoiced_minor) - sum(f.spent_minor))::numeric * 100 / sum(f.invoiced_minor))::int end
                as "marginPct"
         from project p join project_finance f on f.project_id = p.id left join project_type t on t.id = p.type_id
        where p.org_id = $1 and p.archived_at is null
        group by t.name order by "marginMinor" desc nulls last`,
      [actor.orgId],
    );
    return rows as { segment: string; projects: number; invoicedMinor: number; spentMinor: number; marginMinor: number; marginPct: number | null }[];
  });
}
