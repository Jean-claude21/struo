// Indicators (spec 039): the company's figures for a period — money (for roles that read it),
// field, planning, compliance — each with its definition, the trend over twelve months, and every
// open site against its schedule (SPI) and its costs (CPI). The report prints the same figures.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FileText, Info } from 'lucide-react';
import { BarChart, Legend } from '@/components/charts.tsx';
import { KpiTile, PageHeader, Panel } from '@/components/kit.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { getIndicators } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Search = { from?: string; to?: string; preset?: string };

export const Route = createFileRoute('/app/indicators')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.from === 'string' ? { from: search.from } : {}), ...(typeof search.to === 'string' ? { to: search.to } : {}),
    ...(typeof search.preset === 'string' ? { preset: search.preset } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getIndicators({ data: rangeOf(deps) }),
  component: Indicators,
});

const iso = (date: Date) => date.toISOString().slice(0, 10);
const PRESETS = ['7d', '30d', 'month', 'quarter', '12m'] as const;
function rangeOf(search: Search): { from: string; to: string } {
  if (search.from && search.to) return { from: search.from, to: search.to };
  const today = new Date();
  const preset = search.preset ?? '30d';
  if (preset === '7d') return { from: iso(new Date(Date.now() - 6 * 86_400_000)), to: iso(today) };
  if (preset === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1, 12)), to: iso(today) };
  if (preset === 'quarter') return { from: iso(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1, 12)), to: iso(today) };
  if (preset === '12m') return { from: iso(new Date(Date.now() - 364 * 86_400_000)), to: iso(today) };
  return { from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(today) };
}

function Indicators() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/app/indicators' });
  const k = data.kpis;
  const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? '—' : formatMoney(locale, minor, data.currency));
  const pct = (value: number | null) => (value === null ? '—' : `${value} %`);
  const days = (value: number | null) => (value === null ? '—' : t('kpi.days', { n: value }));
  const ratio = (value: number | null) => (value === null ? '—' : new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value));
  const decimal = (value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 1 : 0 }).format(value);
  const tip = (key: string) => <span title={t(`kpi.def.${key}` as MessageKey)} style={{ cursor: 'help' }}><Info size={12} /></span>;
  const label = (key: string) => <span className="row tight nowrap">{t(`kpi.${key}` as MessageKey)}{tip(key)}</span>;
  const months = k.trend.map((row) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' }).format(new Date(`${row.month}-15T12:00:00`)));
  const preset = search.from ? 'custom' : search.preset ?? '30d';
  return (
    <div className="stack loose">
      <PageHeader title={t('kpi.title')} text={t('kpi.subtitle', { from: k.period.from, to: k.period.to })}>
        <a className="btn" href={`/print/report?from=${k.period.from}&to=${k.period.to}`} target="_blank" rel="noreferrer"><FileText size={16} />{t('kpi.report')}</a>
      </PageHeader>
      <div className="row tight">
        {PRESETS.map((value) => (
          <button key={value} type="button" className={`chip ${preset === value ? 'selected' : ''}`} onClick={() => void navigate({ search: { preset: value } })}>{t(`kpi.preset.${value}`)}</button>
        ))}
        <span className="sp" />
        <label className="row tight small">{t('kpi.from')}<input type="date" value={k.period.from} onChange={(event) => void navigate({ search: { from: event.target.value, to: k.period.to } })} /></label>
        <label className="row tight small">{t('kpi.to')}<input type="date" value={k.period.to} onChange={(event) => void navigate({ search: { from: k.period.from, to: event.target.value } })} /></label>
      </div>

      {k.finance ? (
        <Panel title={t('kpi.money')}>
          <div className="grid kpi-4">
            <KpiTile label={label('invoiced')} value={money(k.finance.invoicedMinor)} sub={t('kpi.inPeriod')} />
            <KpiTile label={label('collected')} value={money(k.finance.collectedMinor)} sub={`${t('kpi.collectionRate')} ${pct(k.finance.collectionRatePct)}`} tone="brand" />
            <KpiTile label={label('spent')} value={money(k.finance.spentMinor)} sub={t('kpi.inPeriod')} />
            <KpiTile label={label('dso')} value={days(k.finance.dsoDays)} tone={(k.finance.dsoDays ?? 0) > 60 ? 'bad' : undefined} sub={`${t('kpi.payDelay')} ${days(k.finance.payDelayDays)}`} />
            <KpiTile label={label('receivable')} value={money(k.finance.receivableMinor)} sub={`${t('kpi.overdue')} ${money(k.finance.overdueMinor)}`} subTone={k.finance.overdueMinor ? 'bad' : undefined} />
            <KpiTile label={label('overdue60')} value={money(k.finance.overdue60Minor)} tone={k.finance.overdue60Minor ? 'bad' : undefined} />
            <KpiTile label={label('cash')} value={money(k.finance.cashMinor)} sub={`${t('kpi.burn')} ${money(k.finance.burnMinor)}${t('kpi.perMonth')}`} />
            <KpiTile label={label('runway')} value={k.finance.runwayMonths === null ? '—' : t('kpi.months', { n: decimal(k.finance.runwayMonths) })} tone={(k.finance.runwayMonths ?? 99) < 2 ? 'bad' : undefined} />
            <KpiTile label={label('backlog')} value={money(k.finance.backlogMinor)} />
            <KpiTile label={label('retentions')} value={money(k.finance.retentionsMinor)} />
            <KpiTile label={label('cpi')} value={ratio(k.finance.cpi)} tone={(k.finance.cpi ?? 1) < 1 ? 'bad' : undefined} />
          </div>
        </Panel>
      ) : <p className="notice info small">{t('kpi.noMoney')}</p>}

      <Panel title={t('kpi.planningTitle')}>
        <div className="grid">
          <KpiTile label={label('spi')} value={ratio(k.planning.spi)} tone={(k.planning.spi ?? 1) < 0.9 ? 'bad' : undefined} sub={t('kpi.sitesBehind', { n: k.planning.sitesBehind })} />
          <KpiTile label={label('lateMilestones')} value={k.planning.lateMilestones} tone={k.planning.lateMilestones ? 'bad' : undefined} />
          <KpiTile label={label('onTime')} value={pct(k.planning.onTimePct)} sub={t('kpi.reached', { n: k.planning.reached })} />
          <KpiTile label={label('avgDelay')} value={days(k.planning.avgDelayDays)} />
          <KpiTile label={t('kpi.activeSites')} value={k.planning.activeSites} />
        </div>
      </Panel>

      <Panel title={t('kpi.fieldTitle')}>
        <div className="grid kpi-4">
          <KpiTile label={t('kpi.reports')} value={k.field.reports} sub={t('kpi.photos', { n: k.field.photos })} />
          <KpiTile label={t('kpi.toReview')} value={k.field.toReview} tone={k.field.toReview ? 'brand' : undefined} sub={`${t('kpi.reviewDelay')} ${k.field.reviewHours === null ? '—' : t('kpi.hours', { n: k.field.reviewHours })}`} />
          <KpiTile label={label('rejected')} value={pct(k.field.rejectedPct)} />
          <KpiTile label={t('kpi.incidents')} value={k.field.openIncidents} tone={k.field.criticalIncidents ? 'bad' : undefined} sub={t('kpi.critical', { n: k.field.criticalIncidents, created: k.field.newIncidents })} />
          <KpiTile label={label('resolve')} value={days(k.field.resolveDays)} />
          <KpiTile label={label('checklists')} value={pct(k.field.checklistsCompletePct)} sub={t('kpi.count', { n: k.field.checklists })} />
          <KpiTile label={label('reserves')} value={pct(k.field.deliveryReservesPct)} sub={t('kpi.deliveries', { n: k.field.deliveries })} />
          <KpiTile label={t('kpi.compliance')} value={pct(k.compliance.pct)} tone={k.compliance.expired ? 'bad' : undefined} sub={t('kpi.expired', { n: k.compliance.expired, soon: k.compliance.expiringSoon })} />
        </div>
      </Panel>

      <div className="grid-2">
        {k.finance ? (
          <Panel title={t('kpi.trendMoney')}>
            <BarChart categories={months} locale={locale} label={t('kpi.trendMoney')} series={[
              { values: k.trend.map((row) => row.invoiced ?? 0), color: 'var(--info, #2f5f8a)' },
              { values: k.trend.map((row) => row.collected ?? 0), color: 'var(--ok, #3d704e)' },
              { values: k.trend.map((row) => row.spent ?? 0), color: 'var(--warn, #a36a12)' },
            ]} />
            <Legend items={[{ label: t('kpi.invoiced'), color: 'var(--info, #2f5f8a)' }, { label: t('kpi.collected'), color: 'var(--ok, #3d704e)' }, { label: t('kpi.spent'), color: 'var(--warn, #a36a12)' }]} />
          </Panel>
        ) : null}
        <Panel title={t('kpi.trendField')}>
          <BarChart categories={months} locale={locale} label={t('kpi.trendField')} series={[
            { values: k.trend.map((row) => row.reports), color: 'var(--brand)' },
            { values: k.trend.map((row) => row.incidents), color: 'var(--bad, #8e2a22)' },
          ]} />
          <Legend items={[{ label: t('kpi.reports'), color: 'var(--brand)' }, { label: t('kpi.incidents'), color: 'var(--bad, #8e2a22)' }]} />
        </Panel>
      </div>

      <Panel title={t('kpi.sitesTitle')} sub={t('kpi.sitesSub')} flush>
        <div className="table-wrap"><table>
          <thead><tr>
            <th>{t('shell.sites')}</th><th className="right">{t('kpi.progress')}</th><th className="right">{t('kpi.planned')}</th><th className="right">SPI</th>
            {k.money ? <><th className="right">CPI</th><th className="right">{t('kpi.projectedMargin')}</th><th className="right">{t('kpi.overdue')}</th></> : null}
          </tr></thead>
          <tbody>{k.sites.map((site) => (
            <tr key={site.id}>
              <td><Link to="/app/projects/$projectId" params={{ projectId: site.id }}><b>{site.code}</b> {site.name}</Link></td>
              <td className="right">{site.progress} %</td>
              <td className="right muted">{site.planned === null ? '—' : `${site.planned} %`}</td>
              <td className="right" style={{ color: site.spi !== null && site.spi < 0.9 ? 'var(--bad)' : undefined, fontWeight: 600 }}>{ratio(site.spi)}</td>
              {k.money ? <>
                <td className="right" style={{ color: site.cpi !== null && site.cpi !== undefined && site.cpi < 1 ? 'var(--bad)' : undefined, fontWeight: 600 }}>{ratio(site.cpi ?? null)}</td>
                <td className="right">{site.projectedMarginPct === null || site.projectedMarginPct === undefined ? '—' : `${site.projectedMarginPct} %`}</td>
                <td className="right">{money(site.overdueMinor)}</td>
              </> : null}
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>
      <p className="faint xsmall">{t('kpi.definitionsNote')}</p>
    </div>
  );
}
