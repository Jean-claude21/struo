import { asActor } from './access.ts';
import type { Actor, Db } from './db.ts';
import { can } from './permissions.ts';

/**
 * The company's indicators (spec 039), computed by the database for a period, with the money only
 * for roles that read finance. Definitions (printed on the page):
 *
 * - DSO (days sales outstanding) = receivable today ÷ invoiced over the last 90 days × 90.
 * - Average payment delay = average of (payment date − due date) over payments of the period.
 * - Cash burn = average spending per month over the last 3 months; runway = cash ÷ cash burn.
 * - Backlog = what remains to invoice on open sites (budget − invoiced before VAT).
 * - CPI (cost performance) = earned value ÷ spent, earned value = budget × validated progress.
 * - SPI (schedule performance) = validated progress ÷ planned progress, planned progress = the share
 *   of the site's dates already elapsed.
 */
export interface KpiPeriod { from: string; to: string }

const num = (value: unknown) => Number(value ?? 0);

export async function companyKpis(db: Db, actor: Actor, period: KpiPeriod) {
  const money = can(actor.role, 'finance.read');
  return asActor(db, actor, async (tx) => {
    const p = [actor.orgId, period.from, period.to];
    const finance = money ? (await tx.query(
      `select
         (select coalesce(sum(amount_minor), 0) from invoice where org_id = $1 and status = 'issued' and issued_on between $2 and $3)::bigint as invoiced,
         (select coalesce(sum(amount_minor), 0) from payment where org_id = $1 and received_on between $2 and $3)::bigint as collected,
         (select coalesce(sum(amount_minor), 0) from expense where org_id = $1 and spent_on between $2 and $3)::bigint as spent,
         (select coalesce(sum(balance_minor), 0) from invoice_balance where org_id = $1)::bigint as receivable,
         (select coalesce(sum(balance_minor), 0) from invoice_balance where org_id = $1 and overdue_days > 0)::bigint as overdue,
         (select coalesce(sum(balance_minor), 0) from invoice_balance where org_id = $1 and overdue_days > 60)::bigint as overdue60,
         (select coalesce(sum(total_minor), 0) from invoice where org_id = $1 and status = 'issued' and issued_on > current_date - 90)::bigint as invoiced90,
         (select round(avg(p.received_on - i.due_on)) from payment p join invoice i on i.id = p.invoice_id
           where p.org_id = $1 and p.received_on between $2 and $3) as "payDelay",
         (select coalesce(sum(amount_minor), 0) / 3.0 from expense where org_id = $1 and spent_on > current_date - 90) as burn,
         (select coalesce(sum(cash_minor), 0) from project_finance where org_id = $1)::bigint as cash,
         (select coalesce(sum(retention_minor), 0) from project_finance where org_id = $1)::bigint as retentions,
         (select coalesce(sum(greatest(p.budget_minor - coalesce(f.invoiced_minor * 10000 / (10000 + p.vat_bps), 0), 0)), 0)
            from project p join project_finance f on f.project_id = p.id where p.org_id = $1 and p.archived_at is null and p.status in ('active', 'suspended', 'pending'))::bigint as backlog`,
      p)).rows[0] : null;
    const field = (await tx.query(
      `select
         (select count(*) from site_report where org_id = $1 and taken_at::date between $2 and $3)::int as reports,
         (select count(*) from site_report where org_id = $1 and status = 'pending')::int as "toReview",
         (select count(*) from site_report where org_id = $1 and status = 'rejected' and taken_at::date between $2 and $3)::int as rejected,
         (select round(avg(extract(epoch from (reviewed_at - created_at)) / 3600)) from site_report where org_id = $1 and reviewed_at is not null and taken_at::date between $2 and $3) as "reviewHours",
         (select count(*) from report_photo ph join site_report r on r.id = ph.report_id where r.org_id = $1 and r.taken_at::date between $2 and $3)::int as photos,
         (select count(*) from incident where org_id = $1 and status <> 'resolved')::int as "openIncidents",
         (select count(*) from incident where org_id = $1 and status <> 'resolved' and priority = 'critical')::int as "criticalIncidents",
         (select count(*) from incident where org_id = $1 and created_at::date between $2 and $3)::int as "newIncidents",
         (select round(avg(extract(epoch from (resolved_at - created_at)) / 86400)) from incident where org_id = $1 and resolved_at is not null and resolved_at::date between $2 and $3) as "resolveDays",
         (select count(*) from checklist_run where org_id = $1 and done_at::date between $2 and $3)::int as checklists,
         (select count(*) filter (where completed) * 100 / nullif(count(*), 0) from checklist_run where org_id = $1 and done_at::date between $2 and $3) as "checklistsComplete",
         (select count(*) from delivery where org_id = $1 and delivered_on between $2 and $3)::int as deliveries,
         (select count(*) filter (where verdict = 'reserve') * 100 / nullif(count(*), 0) from delivery where org_id = $1 and delivered_on between $2 and $3) as "deliveryReserves"`,
      p)).rows[0];
    const planning = (await tx.query(
      `select
         (select count(*) from milestone_status where org_id = $1 and status = 'late')::int as "lateMilestones",
         (select count(*) from milestone m where m.org_id = $1 and m.actual_on between $2 and $3)::int as reached,
         (select count(*) filter (where m.actual_on <= m.planned_on) * 100 / nullif(count(*), 0) from milestone m where m.org_id = $1 and m.actual_on between $2 and $3) as "onTimePct",
         (select round(avg(greatest(m.actual_on - m.planned_on, 0))) from milestone m where m.org_id = $1 and m.actual_on between $2 and $3) as "avgDelay",
         (select count(*) from project where org_id = $1 and archived_at is null and status = 'active')::int as "activeSites"`,
      p)).rows[0];
    const compliance = (await tx.query(
      `select count(*) filter (where status = 'valid') * 100 / nullif(count(*) filter (where required), 0) as pct,
              count(*) filter (where status = 'expired')::int as expired,
              count(*) filter (where days_left between 0 and 30)::int as "expiringSoon"
         from document_status where org_id = $1`, [actor.orgId])).rows[0];
    // Per site: progress against the schedule, costs against earned value.
    const sites = (await tx.query(
      `select p.id, p.code, p.name, p.status, f.progress_pct as progress,
              case when p.start_date is null or p.end_date is null or p.end_date <= p.start_date then null
                   else least(100, greatest(0, round((current_date - p.start_date) * 100.0 / (p.end_date - p.start_date)))) end as planned,
              p.budget_minor as budget, f.spent_minor as spent, f.overdue_minor as overdue, f.health
         from project p join project_finance f on f.project_id = p.id
        where p.org_id = $1 and p.archived_at is null and p.status in ('active', 'suspended') order by p.code`, [actor.orgId])).rows.map((row) => {
      const progress = num(row.progress); const planned = row.planned === null ? null : num(row.planned);
      const earned = (num(row.budget) * progress) / 100; const spent = num(row.spent);
      return {
        id: String(row.id), code: String(row.code), name: String(row.name), status: String(row.status), health: String(row.health), progress, planned,
        spi: planned && planned > 0 ? Math.round((progress / planned) * 100) / 100 : null,
        ...(money ? { cpi: spent > 0 ? Math.round((earned / spent) * 100) / 100 : null, spentMinor: spent, budgetMinor: num(row.budget), overdueMinor: num(row.overdue),
          projectedMarginPct: progress > 0 && num(row.budget) > 0 ? Math.round(((num(row.budget) - (spent * 100) / progress) * 100) / num(row.budget)) : null } : {}),
      };
    });
    // Twelve months of trend.
    const trend = (await tx.query(
      `with m as (select generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month')::date as month)
       select to_char(m.month, 'YYYY-MM') as month,
              ${money ? `(select coalesce(sum(amount_minor), 0) from invoice i where i.org_id = $1 and i.status = 'issued' and date_trunc('month', i.issued_on) = m.month)::bigint as invoiced,
              (select coalesce(sum(amount_minor), 0) from payment x where x.org_id = $1 and date_trunc('month', x.received_on) = m.month)::bigint as collected,
              (select coalesce(sum(amount_minor), 0) from expense e where e.org_id = $1 and date_trunc('month', e.spent_on) = m.month)::bigint as spent,` : ''}
              (select count(*) from site_report r where r.org_id = $1 and date_trunc('month', r.taken_at) = m.month)::int as reports,
              (select count(*) from incident i where i.org_id = $1 and date_trunc('month', i.created_at) = m.month)::int as incidents
         from m order by m.month`, [actor.orgId])).rows.map((row) => ({
      month: String(row.month), reports: num(row.reports), incidents: num(row.incidents),
      ...(money ? { invoiced: num(row.invoiced), collected: num(row.collected), spent: num(row.spent) } : {}),
    }));

    const financeOut = finance ? (() => {
      const receivable = num(finance.receivable); const invoiced90 = num(finance.invoiced90); const burn = num(finance.burn); const cash = num(finance.cash);
      const earned = sites.reduce((sum, site) => sum + ((site.budgetMinor ?? 0) * site.progress) / 100, 0);
      const spentOpen = sites.reduce((sum, site) => sum + (site.spentMinor ?? 0), 0);
      return {
        invoicedMinor: num(finance.invoiced), collectedMinor: num(finance.collected), spentMinor: num(finance.spent),
        receivableMinor: receivable, overdueMinor: num(finance.overdue), overdue60Minor: num(finance.overdue60),
        dsoDays: invoiced90 > 0 ? Math.round((receivable / invoiced90) * 90) : null,
        payDelayDays: finance.payDelay === null ? null : num(finance.payDelay),
        // Share of what was owed that came in: collected ÷ (collected + still receivable). Never above 100 %.
        collectionRatePct: num(finance.collected) + receivable > 0 ? Math.round((num(finance.collected) * 100) / (num(finance.collected) + receivable)) : null,
        cashMinor: cash, burnMinor: Math.round(burn), runwayMonths: burn > 0 ? Math.round((cash / burn) * 10) / 10 : null,
        retentionsMinor: num(finance.retentions), backlogMinor: num(finance.backlog),
        cpi: spentOpen > 0 ? Math.round((earned / spentOpen) * 100) / 100 : null,
      };
    })() : null;
    const spis = sites.map((site) => site.spi).filter((value): value is number => value !== null);
    return {
      period, money,
      finance: financeOut,
      field: {
        reports: num(field.reports), toReview: num(field.toReview), rejectedPct: num(field.reports) ? Math.round((num(field.rejected) * 100) / num(field.reports)) : 0,
        reviewHours: field.reviewHours === null ? null : num(field.reviewHours), photos: num(field.photos), openIncidents: num(field.openIncidents),
        criticalIncidents: num(field.criticalIncidents), newIncidents: num(field.newIncidents), resolveDays: field.resolveDays === null ? null : num(field.resolveDays),
        checklists: num(field.checklists), checklistsCompletePct: field.checklistsComplete === null ? null : num(field.checklistsComplete),
        deliveries: num(field.deliveries), deliveryReservesPct: field.deliveryReserves === null ? null : num(field.deliveryReserves),
      },
      planning: {
        activeSites: num(planning.activeSites), lateMilestones: num(planning.lateMilestones), reached: num(planning.reached),
        onTimePct: planning.onTimePct === null ? null : num(planning.onTimePct), avgDelayDays: planning.avgDelay === null ? null : num(planning.avgDelay),
        spi: spis.length ? Math.round((spis.reduce((sum, value) => sum + value, 0) / spis.length) * 100) / 100 : null,
        sitesBehind: sites.filter((site) => site.spi !== null && site.spi < 0.9).length,
      },
      compliance: { pct: compliance.pct === null ? null : num(compliance.pct), expired: num(compliance.expired), expiringSoon: num(compliance.expiringSoon) },
      sites, trend,
    };
  });
}

/** What happened during a period, for the weekly and monthly report. */
export async function periodActivity(db: Db, actor: Actor, period: KpiPeriod) {
  const money = can(actor.role, 'finance.read');
  return asActor(db, actor, async (tx) => {
    const p = [actor.orgId, period.from, period.to];
    const [invoices, payments, milestones, incidents] = await Promise.all([
      money ? tx.query(`select i.number, p.code as site, i.amount_minor as amount, i.issued_on as date from invoice i join project p on p.id = i.project_id where i.org_id = $1 and i.status = 'issued' and i.issued_on between $2 and $3 order by i.issued_on`, p) : Promise.resolve({ rows: [] }),
      money ? tx.query(`select p.code as site, x.amount_minor as amount, x.received_on as date, x.method from payment x join project p on p.id = x.project_id where x.org_id = $1 and x.received_on between $2 and $3 order by x.received_on`, p) : Promise.resolve({ rows: [] }),
      tx.query(`select p.code as site, m.name, m.planned_on as planned, m.actual_on as actual from milestone m join project p on p.id = m.project_id where m.org_id = $1 and m.actual_on between $2 and $3 order by m.actual_on`, p),
      tx.query(`select p.code as site, i.kind, i.priority, i.description, i.status from incident i join project p on p.id = i.project_id where i.org_id = $1 and i.created_at::date between $2 and $3 order by i.created_at`, p),
    ]);
    return {
      invoices: invoices.rows as { number: string | null; site: string; amount: number; date: string }[],
      payments: payments.rows as { site: string; amount: number; date: string; method: string }[],
      milestones: milestones.rows as { site: string; name: string; planned: string | null; actual: string }[],
      incidents: incidents.rows as { site: string; kind: string; priority: string; description: string; status: string }[],
    };
  });
}
