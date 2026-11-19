// Expenses and profitability (screen G6): margin by segment as a chart, the most profitable segment
// named, cost performance per site, then every expense in the view engine (group by site or
// category, filter, export).
import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Download, PieChart, Trash2, TrendingUp } from 'lucide-react';
import { ExpenseDialog } from '@/components/forms.tsx';
import { BarChart, compact, Donut, Legend } from '@/components/charts.tsx';
import { KpiTile, PageHeader, Panel, Progress, useToast } from '@/components/kit.tsx';
import { DateText, formatMoney } from '@/components/ui.tsx';
import { DataTable, type Column } from '@/components/views/DataTable.tsx';
import { applyView, useViewState, type FieldDef } from '@/components/views/engine.ts';
import { ViewToolbar } from '@/components/views/Toolbar.tsx';
import { getExpenses, removeExpense } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/expenses')({
  loader: () => getExpenses(),
  component: Expenses,
});

const CATEGORIES = ['materials', 'labour', 'subcontracting', 'equipment', 'transport', 'fees', 'other'] as const;
const CATEGORY_COLOR: Record<string, string> = {
  materials: '#e8590c', labour: '#1c6dd0', subcontracting: '#7048c8', equipment: '#0c8599', transport: '#b26a00', fees: '#c2255c', other: '#949494',
};

function Expenses() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const canWrite = can(data.role, 'expenses.write');
  const money = (minor: number) => formatMoney(locale, minor, data.currency);
  const view = useViewState('expenses', { mode: 'table', sort: { key: 'date', dir: -1 } });
  type Row = (typeof data.expenses)[number];
  const category = (value: string) => t(`expenses.categories.${value}` as MessageKey);

  const fields: FieldDef<Row>[] = useMemo(() => [
    { key: 'label', label: t('expenses.label'), type: 'text', get: (row) => row.label },
    { key: 'site', label: t('app.project'), type: 'enum', groupable: true, get: (row) => row.projectCode },
    { key: 'category', label: t('expenses.category'), type: 'enum', groupable: true, get: (row) => row.category, options: CATEGORIES.map((value) => ({ value, label: category(value), color: CATEGORY_COLOR[value] })) },
    { key: 'supplier', label: t('expenses.supplier'), type: 'enum', groupable: true, get: (row) => row.supplier ?? '' },
    { key: 'date', label: t('app.date'), type: 'date', get: (row) => row.spentOn, filterable: false },
    { key: 'amount', label: t('app.amount'), type: 'money', get: (row) => row.amountMinor },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [locale]);
  const rows = applyView(data.expenses, fields, view.state);
  const columns: Column<Row>[] = [
    { key: 'label', label: t('expenses.label'), width: 280, cell: (row) => row.label },
    { key: 'site', label: t('app.project'), width: 110, cell: (row) => <b>{row.projectCode}</b> },
    { key: 'category', label: t('expenses.category'), width: 170, cell: (row) => <span className="row tight nowrap"><span className="dot" style={{ ['--c' as string]: CATEGORY_COLOR[row.category] }} />{category(row.category)}</span> },
    { key: 'supplier', label: t('expenses.supplier'), width: 180, cell: (row) => row.supplier ?? '—' },
    { key: 'date', label: t('app.date'), width: 120, cell: (row) => <DateText value={row.spentOn} /> },
    { key: 'amount', label: t('app.amount'), width: 150, align: 'right', cell: (row) => <b>{money(row.amountMinor)}</b> },
  ];

  const segments = data.bySegment;
  const best = [...segments].filter((segment) => segment.marginPct !== null).sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))[0];
  const totalSpent = data.byProject.reduce((sum, project) => sum + Number(project.spentMinor), 0);
  const totalInvoiced = data.byProject.reduce((sum, project) => sum + Number(project.invoicedMinor), 0);
  const byCategory = CATEGORIES.map((value) => ({ value, total: data.expenses.filter((expense) => expense.category === value).reduce((sum, expense) => sum + expense.amountMinor, 0) })).filter((item) => item.total > 0);
  const exportCsv = (ids: string[]) => {
    const chosen = data.expenses.filter((expense) => ids.includes(expense.id));
    const lines = chosen.map((expense) => [expense.spentOn, expense.projectCode, category(expense.category), expense.label, expense.supplier ?? '', String(expense.amountMinor)].map((cell) => `"${cell.replace(/"/gu, '""')}"`).join(';'));
    const blob = new Blob([`﻿${[[t('app.date'), t('app.project'), t('expenses.category'), t('expenses.label'), t('expenses.supplier'), t('app.amount')].join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'depenses.csv'; link.click();
  };

  return (
    <div className="stack loose">
      <PageHeader title={t('expenses.title')} text={t('exp.subtitle')}>
        {canWrite && data.projects.length ? <ExpenseDialog projects={data.projects} currency={data.currency} /> : null}
      </PageHeader>
      <div className="grid">
        <KpiTile label={t('expenses.spent')} value={money(totalSpent)} tone="brand" />
        <KpiTile label={t('expenses.invoiced')} value={money(totalInvoiced)} />
        <KpiTile icon={TrendingUp} label={t('expenses.margin')} value={totalInvoiced ? `${Math.round(((totalInvoiced - totalSpent) / totalInvoiced) * 100)} %` : '—'} sub={money(totalInvoiced - totalSpent)} subTone={totalInvoiced - totalSpent < 0 ? 'bad' : 'ok'} />
        {best ? <KpiTile icon={PieChart} label={t('exp.best')} value={best.segment} sub={`${best.marginPct} %`} subTone="ok" /> : null}
      </div>
      <div className="grid-main">
        <Panel title={t('expenses.bySegment')}>
          {segments.length ? (
            <>
              <BarChart categories={segments.map((segment) => segment.segment)} locale={locale} label={t('expenses.bySegment')}
                highlight={best ? segments.indexOf(best) : undefined}
                series={[{ values: segments.map((segment) => Number(segment.invoicedMinor)), color: 'var(--brand)' }, { values: segments.map((segment) => Number(segment.spentMinor)), color: 'var(--surface-3)' }]} />
              <Legend items={[{ label: t('expenses.invoiced'), color: 'var(--brand)' }, { label: t('expenses.spent'), color: 'var(--surface-3)' }]} />
            </>
          ) : <p className="muted">{t('expenses.noExpenses')}</p>}
        </Panel>
        <Panel title={t('exp.byCategory')}>
          <div className="row nowrap" style={{ gap: '1rem', alignItems: 'center' }}>
            <Donut size={140} thickness={16} label={t('exp.byCategory')} segments={byCategory.map((item) => ({ value: item.total, color: CATEGORY_COLOR[item.value]! }))} center={<span style={{ fontWeight: 700 }}>{compact(totalSpent, locale)}</span>} />
            <div className="stack" style={{ gap: '.35rem' }}>
              {byCategory.map((item) => (
                <span key={item.value} className="row tight nowrap small"><span className="dot" style={{ ['--c' as string]: CATEGORY_COLOR[item.value] }} /><span className="grow">{category(item.value)}</span><b className="num">{Math.round((item.total / (totalSpent || 1)) * 100)} %</b></span>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <Panel title={t('expenses.byProject')} sub={t('expenses.cpiHelp')} flush>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('app.project')}</th><th>{t('projects.progress')}</th><th className="right">{t('projects.budget')}</th><th className="right">{t('expenses.spent')}</th><th className="right">{t('expenses.margin')}</th><th className="right">{t('expenses.cpi')}</th></tr></thead>
          <tbody>{data.byProject.map((project) => (
            <tr key={project.projectId}>
              <td><Link to="/app/projects/$projectId" params={{ projectId: project.projectId }}><b>{project.code}</b> {project.name}</Link></td>
              <td style={{ width: 180 }}><Progress value={project.progressPct} /></td>
              <td className="right num">{money(Number(project.budgetMinor))}</td>
              <td className="right num">{money(Number(project.spentMinor))}</td>
              <td className="right num" style={{ color: Number(project.marginMinor) < 0 ? 'var(--bad)' : undefined }}>{money(Number(project.marginMinor))}{project.marginPct !== null ? <span className="faint"> · {project.marginPct} %</span> : null}</td>
              <td className="right"><b style={{ color: project.cpi === null ? undefined : project.cpi < 1 ? 'var(--bad)' : 'var(--ok)' }}>{project.cpi ?? '—'}</b></td>
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>
      <div>
        <ViewToolbar rows={data.expenses} fields={fields} state={view.state} update={view.update} columns saved={view.saved} onSave={view.saveView} onRemoveSaved={view.removeView} onRenameSaved={view.renameView} />
        <DataTable rows={rows} columns={columns} fields={fields} state={view.state} update={view.update} rowId={(row) => row.id}
          groupHeader={(_, groupRows) => <b className="num small">{money(groupRows.reduce((sum, row) => sum + row.amountMinor, 0))}</b>}
          bulkActions={(ids, clear) => (
            <>
              <button type="button" className="btn small" onClick={() => exportCsv(ids)}><Download size={14} />{t('fin.exportCsv')}</button>
              {canWrite ? (
                <button type="button" className="btn small" onClick={async () => {
                  if (!window.confirm(t('exp.removeConfirm', { n: ids.length }))) return;
                  for (const id of ids) await removeExpense({ data: { id } }).catch(() => undefined);
                  clear(); toast({ text: t('ui.deleted') }); await router.invalidate();
                }}><Trash2 size={14} />{t('app.remove')}</button>
              ) : null}
            </>
          )} />
      </div>
    </div>
  );
}
