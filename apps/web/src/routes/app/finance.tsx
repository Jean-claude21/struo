import { can } from '@struo/core/permissions';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Download, FileText, Kanban, Table2, TriangleAlert, Wallet } from 'lucide-react';
import { InvoiceDialog, PaymentDialog, ReminderDialog } from '@/components/forms.tsx';
import { StatementDialog } from '@/components/StatementDialog.tsx';
import { Drawer, KpiTile, Modal, PageHeader, Panel, StatusChip, useRelative, useToast, type Shape } from '@/components/kit.tsx';
import { DateText, formatMoney, Money, Tabs } from '@/components/ui.tsx';
import { Board } from '@/components/views/Board.tsx';
import { DataTable, type Column } from '@/components/views/DataTable.tsx';
import { applyView, useViewState, type FieldDef } from '@/components/views/engine.ts';
import { ViewToolbar } from '@/components/views/Toolbar.tsx';
import { cancelInvoice, getFinance } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/finance')({
  validateSearch: (search: Record<string, unknown>): { new?: string; invoice?: string } => ({
    ...(typeof search.new === 'string' ? { new: search.new } : {}),
    ...(typeof search.invoice === 'string' ? { invoice: search.invoice } : {}),
  }),
  loader: () => getFinance(),
  component: Finance,
});

type Data = Awaited<ReturnType<typeof getFinance>>;
type Invoice = Data['invoices'][number];
type Stage = 'draft' | 'issued' | 'partial' | 'overdue' | 'paid' | 'cancelled';
const STAGES: Stage[] = ['draft', 'issued', 'partial', 'overdue', 'paid', 'cancelled'];
const STAGE_SHAPE: Record<Stage, Shape> = { draft: 'todo', issued: 'todo', partial: 'progress', overdue: 'late', paid: 'done', cancelled: 'blocked' };
const STAGE_COLOR: Record<Stage, string> = { draft: '#949494', issued: '#1c6dd0', partial: '#b26a00', overdue: '#d92d2d', paid: '#2f9e44', cancelled: '#6b6b6b' };

export const stageOf = (invoice: Invoice): Stage =>
  invoice.status === 'cancelled' ? 'cancelled'
    : invoice.status === 'draft' ? 'draft'
    : invoice.balanceMinor <= 0 ? 'paid'
    : invoice.overdueDays > 0 ? 'overdue'
    : invoice.paidMinor > 0 ? 'partial' : 'issued';

function Finance() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const ago = useRelative();
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [openId, setOpenId] = useState<string | null>(search.invoice ?? null);
  const [paying, setPaying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  const currency = data.settings.currencyCode;
  const canWrite = can(data.role, 'finance.write');
  const money = (minor: number) => formatMoney(locale, minor, currency);
  const view = useViewState('finance.invoices', { mode: 'table', sort: { key: 'due', dir: 1 } });
  const stageLabel = (stage: Stage) => t(`fin.stages.${stage}` as MessageKey);

  const fields: FieldDef<Invoice>[] = useMemo(() => [
    { key: 'number', label: t('finance.invoice'), type: 'text', get: (row) => row.number },
    { key: 'stage', label: t('fin.stage'), type: 'enum', groupable: true, get: stageOf, options: STAGES.map((stage) => ({ value: stage, label: stageLabel(stage), color: STAGE_COLOR[stage] })) },
    { key: 'site', label: t('fin.site'), type: 'enum', groupable: true, get: (row) => row.projectName, options: [...new Set(data.invoices.map((row) => row.projectName))].map((name) => ({ value: name, label: name })) },
    { key: 'client', label: t('fin.client'), type: 'enum', groupable: true, get: (row) => row.clientName ?? '' },
    { key: 'kind', label: t('fin.kind'), type: 'enum', groupable: true, get: (row) => row.kind, options: ['advance', 'progress', 'final'].map((kind) => ({ value: kind, label: t(`finance.kinds.${kind}` as MessageKey) })) },
    { key: 'issued', label: t('fin.issued'), type: 'date', get: (row) => row.issuedOn, filterable: false },
    { key: 'due', label: t('fin.due'), type: 'date', groupable: true, get: (row) => (stageOf(row) === 'paid' || stageOf(row) === 'cancelled' ? null : row.dueOn) },
    { key: 'net', label: t('fin.net'), type: 'money', get: (row) => row.netMinor },
    { key: 'balance', label: t('fin.balance'), type: 'money', get: (row) => row.balanceMinor },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [data.invoices, locale]);

  const rows = applyView(data.invoices, fields, view.state);
  const columns: Column<Invoice>[] = [
    { key: 'number', label: t('finance.invoice'), width: 190, cell: (row) => <span className="row tight nowrap"><FileText size={14} style={{ color: 'var(--ink-faint)' }} />{row.number}</span> },
    { key: 'stage', label: t('fin.stage'), width: 170, cell: (row) => <StatusChip shape={STAGE_SHAPE[stageOf(row)]} label={stageLabel(stageOf(row))} /> },
    { key: 'site', label: t('fin.site'), width: 220, cell: (row) => row.projectName },
    { key: 'client', label: t('fin.client'), width: 180, cell: (row) => row.clientName ?? '—' },
    { key: 'issued', label: t('fin.issued'), width: 120, cell: (row) => <DateText value={row.issuedOn} /> },
    { key: 'due', label: t('fin.due'), width: 150, cell: (row) => (
      <span style={{ color: stageOf(row) === 'overdue' ? 'var(--bad)' : undefined }}>
        <DateText value={row.dueOn} />{stageOf(row) === 'overdue' ? ` · ${t('ui.lateDays', { n: row.overdueDays })}` : ''}
      </span>) },
    { key: 'net', label: t('fin.net'), width: 150, align: 'right', cell: (row) => <Money minor={row.netMinor} currency={row.currencyCode} /> },
    { key: 'balance', label: t('fin.balance'), width: 150, align: 'right', cell: (row) => <b style={{ fontWeight: 600 }}><Money minor={row.balanceMinor} currency={row.currencyCode} /></b> },
    { key: 'reminders', label: t('fin.reminders'), width: 140, cell: (row) => (row.lastReminderAt ? `${row.reminders} · ${ago(row.lastReminderAt)}` : '—') },
  ];

  const issued = data.invoices.filter((invoice) => invoice.status === 'issued');
  const netTotal = issued.reduce((sum, invoice) => sum + invoice.netMinor, 0);
  const paidTotal = issued.reduce((sum, invoice) => sum + invoice.paidMinor, 0);
  const overdue = issued.filter((invoice) => stageOf(invoice) === 'overdue');
  const overdueMinor = overdue.reduce((sum, invoice) => sum + invoice.balanceMinor, 0);
  const aging = (['notDue', 'd30', 'd60', 'd90', 'd90plus'] as const).map((bucket) => ({ ...data.aging[bucket], bucket }));
  const agingTotal = aging.reduce((sum, item) => sum + item.amount, 0);
  const agingColors = ['#1c6dd0', '#f59f00', '#e8590c', '#d9480f', '#c92a2a'];
  const current = data.invoices.find((invoice) => invoice.id === openId) ?? null;

  const exportCsv = (ids: string[]) => {
    const chosen = data.invoices.filter((invoice) => ids.includes(invoice.id));
    const head = [t('finance.invoice'), t('fin.site'), t('fin.client'), t('fin.issued'), t('fin.due'), t('fin.net'), t('fin.balance'), t('fin.stage')];
    const lines = chosen.map((invoice) => [invoice.number, invoice.projectName, invoice.clientName ?? '', invoice.issuedOn, invoice.dueOn,
      String(invoice.netMinor), String(invoice.balanceMinor), stageLabel(stageOf(invoice))].map((cell) => `"${cell.replace(/"/gu, '""')}"`).join(';'));
    const blob = new Blob([`﻿${[head.join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'factures.csv'; link.click();
  };

  return (
    <div className="stack loose">
      <PageHeader title={t('finance.title')} text={t('fin.subtitle')}>
        {canWrite && data.projects.length ? (
          <>
            <StatementDialog projects={data.projects} currency={currency} />
            <PaymentDialog projects={data.projects} currency={currency} invoices={data.invoices} />
            <InvoiceDialog projects={data.projects} currency={currency} defaultOpen={search.new === '1'} />
          </>
        ) : null}
      </PageHeader>
      <div className="grid">
        <KpiTile icon={Wallet} label={t('dashboard.receivable')} value={money(data.summary.receivableMinor)} tone="brand" sub={t('fin.overdueCount', { n: overdue.length })} subTone={overdue.length ? 'bad' : undefined} />
        <KpiTile label={t('fin.collectionRate')} value={`${netTotal ? Math.round((paidTotal / netTotal) * 100) : 0} %`} sub={`${money(paidTotal)} / ${money(netTotal)}`} />
        <KpiTile icon={TriangleAlert} label={t('fin.overdueAmount')} value={money(overdueMinor)} tone={overdueMinor ? 'bad' : undefined} />
        <KpiTile label={t('dashboard.retention')} value={money(data.summary.retentionMinor)} />
      </div>
      <Panel title={t('fin.agingTitle')} sub={money(agingTotal)}>
        <div className="stackbar" style={{ height: 14 }} role="img" aria-label={t('fin.agingTitle')}>
          {aging.map((item, index) => <i key={item.bucket} style={{ width: `${agingTotal ? (item.amount / agingTotal) * 100 : 0}%`, background: agingColors[index] }} title={`${t(`finance.aging.${item.bucket}`)} : ${money(item.amount)}`} />)}
        </div>
        <div className="legend" style={{ marginTop: '.6rem' }}>
          {aging.map((item, index) => (
            <span key={item.bucket}><i style={{ ['--c' as string]: agingColors[index] }} />{t(`finance.aging.${item.bucket}`)} · <b className="num">{money(item.amount)}</b> <span className="faint">({item.count})</span></span>
          ))}
        </div>
      </Panel>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'invoices', label: `${t('fin.invoicesTab')} · ${data.invoices.length}` }, { value: 'payments', label: `${t('fin.paymentsTab')} · ${data.payments.length}` }]} />
      {tab === 'invoices' ? (
        <div>
          <ViewToolbar rows={data.invoices} fields={fields} state={view.state} update={view.update} columns={view.state.mode === 'table'}
            group={view.state.mode === 'table'} saved={view.saved} onSave={view.saveView} onRemoveSaved={view.removeView}
            modes={[{ value: 'table', label: t('views.table'), icon: Table2 }, { value: 'board', label: t('views.board'), icon: Kanban }]} />
          {view.state.mode === 'board' ? (
            <Board
              rows={rows}
              columns={STAGES.map((stage) => ({ key: stage, label: stageLabel(stage), color: STAGE_COLOR[stage] }))}
              columnOf={stageOf}
              rowId={(row) => row.id}
              collapsed={view.state.collapsed.length ? view.state.collapsed : ['cancelled']}
              onCollapsedChange={(keys) => view.update({ collapsed: keys })}
              sumOf={(cards) => money(cards.reduce((sum, card) => sum + card.balanceMinor, 0))}
              onOpen={(row) => setOpenId(row.id)}
              canDrag={() => canWrite}
              onMove={(row, to) => {
                if (to === 'paid') { setPaying(row.id); toast({ text: t('fin.movedPaid'), kind: 'info' }); return; }
                if (to === 'cancelled') { setCancelling(row); return; }
                toast({ text: t('fin.moveRefused'), kind: 'err' });
              }}
              renderCard={(row) => (
                <>
                  <div className="row nowrap" style={{ gap: '.4rem' }}><span className="k-key">{row.number}</span><span className="sp" />{row.overdueDays > 0 && row.balanceMinor > 0 ? <span className="badge bad">{t('ui.lateDays', { n: row.overdueDays })}</span> : null}</div>
                  <div className="k-title">{row.projectName}</div>
                  <div className="k-meta"><span className="trunc">{row.clientName ?? '—'}</span><span className="k-amount">{money(row.balanceMinor)}</span></div>
                </>
              )}
            />
          ) : (
            <DataTable rows={rows} columns={columns} fields={fields} state={view.state} update={view.update} rowId={(row) => row.id}
              onRowClick={(row) => setOpenId(row.id)}
              bulkActions={(ids) => <button type="button" className="btn small" onClick={() => exportCsv(ids)}><Download size={14} />{t('fin.exportCsv')}</button>} />
          )}
        </div>
      ) : (
        <Panel title={t('fin.paymentsTab')} sub={`${t('fin.totalPaid')} · ${money(data.payments.reduce((sum, payment) => sum + payment.amountMinor, 0))}`} flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('app.date')}</th><th>{t('app.project')}</th><th>{t('finance.invoice')}</th><th>{t('finance.method')}</th><th>{t('finance.reference')}</th><th className="right">{t('app.amount')}</th></tr></thead>
              <tbody>{data.payments.map((payment) => (
                <tr key={payment.id}>
                  <td><DateText value={payment.receivedOn} /></td><td>{payment.projectName}</td><td>{payment.invoiceNumber ?? '—'}</td>
                  <td>{t(`finance.methods.${payment.method as 'other'}`)}</td><td className="muted">{payment.reference ?? '—'}</td>
                  <td className="right"><b><Money minor={payment.amountMinor} currency={payment.currencyCode} /></b></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      )}

      <Drawer open={Boolean(current)} onClose={() => setOpenId(null)} title={current ? `${current.number} · ${current.projectName}` : ''}
        footer={current && canWrite && current.status === 'issued' && current.balanceMinor > 0 ? (
          <>
            <ReminderDialog invoiceId={current.id} channels={data.channels} />
            <button type="button" className="btn" onClick={() => setPaying(current.id)}>{t('finance.newPayment')}</button>
          </>
        ) : undefined}>
        {current ? (
          <div className="stack loose">
            <div className="row"><StatusChip shape={STAGE_SHAPE[stageOf(current)]} label={stageLabel(stageOf(current))} /><span className="sp" />
              <a className="btn secondary small" href={`/print/invoice/${current.id}`} target="_blank" rel="noreferrer"><FileText size={14} />{t('fin.openPdf')}</a></div>
            <div className="grid-2" style={{ gap: '.75rem' }}>
              <KpiTile label={t('fin.net')} value={money(current.netMinor)} />
              <KpiTile label={t('fin.balance')} value={money(current.balanceMinor)} tone={current.balanceMinor > 0 && current.overdueDays > 0 ? 'bad' : 'brand'} />
            </div>
            <dl className="stack" style={{ gap: '.4rem', margin: 0 }}>
              {[
                [t('fin.client'), current.clientName ?? '—'],
                [t('fin.kind'), t(`finance.kinds.${current.kind}` as MessageKey)],
                [t('fin.issued'), <DateText key="i" value={current.issuedOn} />],
                [t('fin.due'), <DateText key="d" value={current.dueOn} />],
                [t('finance.amountHt'), money(current.amountMinor)],
                [t('finance.vat'), money(current.vatMinor)],
                [t('finance.retention'), `− ${money(current.retentionMinor)}`],
                [t('finance.deduction'), `− ${money(current.deductionMinor)}`],
                [t('fin.paid'), money(current.paidMinor)],
              ].map(([label, value], index) => (
                <div key={index} className="row nowrap" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--divider)', paddingBottom: '.35rem' }}>
                  <dt className="muted">{label}</dt><dd style={{ margin: 0, fontWeight: 550 }} className="num">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="muted small">{current.lastReminderAt ? t('fin.lastReminder', { when: ago(current.lastReminderAt) }) : t('fin.noReminder')}</p>
            {canWrite && current.status === 'issued' && current.paidMinor === 0 ? (
              <button type="button" className="btn danger small" onClick={() => setCancelling(current)}>{t('finance.cancelInvoice')}</button>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <PaymentDialog key={paying ?? 'none'} projects={data.projects} currency={currency} invoices={data.invoices}
        open={Boolean(paying)} onOpenChange={(open) => { if (!open) setPaying(null); }} presetInvoiceId={paying ?? undefined} />

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title={t('finance.cancelInvoice')}
        footer={(
          <>
            <button type="button" className="btn secondary" onClick={() => setCancelling(null)}>{t('app.close')}</button>
            <button type="button" className="btn danger" onClick={async () => {
              const invoice = cancelling!; setCancelling(null);
              try {
                await cancelInvoice({ data: { id: invoice.id } });
                toast({ text: t('fin.cancelled', { number: invoice.number }) });
                await router.invalidate();
              } catch {
                toast({ text: t('errors.generic'), kind: 'err' });
              }
            }}>{t('ui.confirm')}</button>
          </>
        )}>
        <p>{cancelling ? t('fin.cancelConfirm', { number: cancelling.number }) : ''}</p>
      </Modal>
    </div>
  );
}
