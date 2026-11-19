// The activity report (spec 039): the indicators of a period and what happened in it, on paper.
// The browser's « print to PDF » makes the file; the weekly and monthly e-mails link here.
import { Fragment, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { formatMoney } from '@/components/ui.tsx';
import { getReport } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Search = { from?: string; to?: string };

export const Route = createFileRoute('/print/report')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.from === 'string' ? { from: search.from } : {}), ...(typeof search.to === 'string' ? { to: search.to } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getReport({ data: deps }),
  component: ReportPrint,
});

function ReportPrint() {
  const { t, locale } = useI18n();
  const report = Route.useLoaderData();
  const k = report.kpis;
  const money = (minor: number | null | undefined) => formatMoney(locale, minor, report.currency);
  const pct = (value: number | null) => (value === null ? '—' : `${value} %`);
  const ratio = (value: number | null | undefined) => (value === null || value === undefined ? '—' : new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value));
  const decimal = (value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 1 : 0 }).format(value);
  const days = (value: number | null) => (value === null ? '—' : t('kpi.days', { n: value }));
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
  const logo = report.logoKey ? `/api/files/logo/${report.orgId}?v=${encodeURIComponent(report.logoKey.slice(-12))}` : null;
  const rows: [MessageKey, string][] = [
    ...(k.finance ? ([
      ['kpi.invoiced', money(k.finance.invoicedMinor)], ['kpi.collected', money(k.finance.collectedMinor)], ['kpi.spent', money(k.finance.spentMinor)],
      ['kpi.collectionRate', pct(k.finance.collectionRatePct)], ['kpi.dso', days(k.finance.dsoDays)], ['kpi.payDelay', days(k.finance.payDelayDays)],
      ['kpi.receivable', money(k.finance.receivableMinor)], ['kpi.overdue', money(k.finance.overdueMinor)], ['kpi.overdue60', money(k.finance.overdue60Minor)],
      ['kpi.cash', money(k.finance.cashMinor)], ['kpi.runway', k.finance.runwayMonths === null ? '—' : t('kpi.months', { n: decimal(k.finance.runwayMonths) })],
      ['kpi.backlog', money(k.finance.backlogMinor)], ['kpi.retentions', money(k.finance.retentionsMinor)], ['kpi.cpi', ratio(k.finance.cpi)],
    ] as [MessageKey, string][]) : []),
    ['kpi.spi', ratio(k.planning.spi)], ['kpi.lateMilestones', String(k.planning.lateMilestones)], ['kpi.onTime', pct(k.planning.onTimePct)],
    ['kpi.avgDelay', days(k.planning.avgDelayDays)], ['kpi.reports', String(k.field.reports)], ['kpi.toReview', String(k.field.toReview)],
    ['kpi.rejected', pct(k.field.rejectedPct)], ['kpi.incidents', String(k.field.openIncidents)], ['kpi.resolve', days(k.field.resolveDays)],
    ['kpi.checklists', pct(k.field.checklistsCompletePct)], ['kpi.reserves', pct(k.field.deliveryReservesPct)], ['kpi.compliance', pct(k.compliance.pct)],
  ];
  const a = report.activity;
  const section = (title: MessageKey, count: number, body: ReactNode) => (
    <section className="stack tight">
      <h3 style={{ margin: '1rem 0 .25rem' }}>{t(title)} ({count})</h3>
      {count ? body : <p className="muted small">{t('kpi.rp.none')}</p>}
    </section>
  );
  return (
    <div className="print-page stack">
      <div className="no-print row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => window.print()}>{t('kpi.rp.print')}</button>
      </div>
      <header className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h1 style={{ margin: 0 }}>{t('kpi.rp.title')}</h1>
          <div><b>{report.company}</b></div>
          <div className="muted small">{t('kpi.rp.period', { from: date(k.period.from), to: date(k.period.to) })}</div>
          <div className="faint xsmall">{t('kpi.rp.generated', { date: date(report.generatedAt) })}</div>
        </div>
        {logo ? <img src={logo} alt="" style={{ maxHeight: 64, maxWidth: 180 }} /> : null}
      </header>

      <table className="report-kpis"><tbody>
        {Array.from({ length: Math.ceil(rows.length / 2) }, (_, index) => (
          <tr key={index}>
            {rows.slice(index * 2, index * 2 + 2).map(([key, value]) => <Fragment key={key}><td className="muted">{t(key)}</td><td className="right"><b>{value}</b></td></Fragment>)}
          </tr>
        ))}
      </tbody></table>

      <h2 style={{ margin: '1rem 0 0' }}>{t('kpi.sitesTitle')}</h2>
      <table><thead><tr>
        <th>{t('shell.sites')}</th><th className="right">{t('kpi.progress')}</th><th className="right">{t('kpi.planned')}</th><th className="right">SPI</th>
        {k.money ? <><th className="right">CPI</th><th className="right">{t('kpi.projectedMargin')}</th></> : null}
      </tr></thead><tbody>
        {k.sites.map((site) => (
          <tr key={site.id}>
            <td><b>{site.code}</b> {site.name}</td><td className="right">{site.progress} %</td>
            <td className="right">{site.planned === null ? '—' : `${site.planned} %`}</td><td className="right">{ratio(site.spi)}</td>
            {k.money ? <><td className="right">{ratio(site.cpi)}</td><td className="right">{site.projectedMarginPct === null || site.projectedMarginPct === undefined ? '—' : `${site.projectedMarginPct} %`}</td></> : null}
          </tr>
        ))}
      </tbody></table>

      <h2 style={{ margin: '1rem 0 0' }}>{t('kpi.rp.activity')}</h2>
      {k.money ? section('kpi.rp.invoices', a.invoices.length, (
        <table><tbody>{a.invoices.map((row, index) => <tr key={index}><td>{date(row.date)}</td><td>{row.number}</td><td>{row.site}</td><td className="right">{money(row.amount)}</td></tr>)}</tbody></table>
      )) : null}
      {k.money ? section('kpi.rp.payments', a.payments.length, (
        <table><tbody>{a.payments.map((row, index) => <tr key={index}><td>{date(row.date)}</td><td>{row.site}</td><td>{row.method}</td><td className="right">{money(row.amount)}</td></tr>)}</tbody></table>
      )) : null}
      {section('kpi.rp.milestones', a.milestones.length, (
        <table><tbody>{a.milestones.map((row, index) => <tr key={index}><td>{date(row.actual)}</td><td>{row.site}</td><td>{row.name}</td><td className="right muted">{row.planned ? date(row.planned) : '—'}</td></tr>)}</tbody></table>
      ))}
      {section('kpi.rp.incidents', a.incidents.length, (
        <table><tbody>{a.incidents.map((row, index) => <tr key={index}><td>{row.site}</td><td>{row.priority}</td><td>{row.description}</td><td>{row.status}</td></tr>)}</tbody></table>
      ))}
    </div>
  );
}
