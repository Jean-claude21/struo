// « Today » (spec 023): one page, shaped by the role. The manager sees decisions, cash, sites, photos
import { PaymentClaims } from '@/components/PaymentClaims.tsx';
import { MaterialRequests } from '@/components/MaterialRequests.tsx';
// and clients; the engineer sees weather, phases and what to review; the accountant sees what to
// collect and what to fix; the site lead is sent to the field app.
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import {
  Camera, CloudRain, FileText, FolderKanban, HardHat, Receipt, Sun, TriangleAlert, Users, Wallet, ClipboardCheck, CalendarClock,
} from 'lucide-react';
import { AlertList, alertsFor } from '@/components/AlertList.tsx';
import { AskCard } from '@/components/Intelligence.tsx';
import { AreaChart, Legend } from '@/components/charts.tsx';
import { EmptyState, KpiTile, Panel, Progress, StatusChip, useRelative, type Shape } from '@/components/kit.tsx';
import { DateText, formatMoney, Money } from '@/components/ui.tsx';
import { getDashboard } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { SitesMap } from '@/components/SitesMap.tsx';
import { usePhotoViewer } from '@/components/PhotoViewer.tsx';

export const Route = createFileRoute('/app/')({
  validateSearch: (search: Record<string, unknown>): { ask?: string } => (typeof search.ask === 'string' ? { ask: search.ask } : {}),
  loader: () => getDashboard(),
  component: Today,
});

const layout = getRouteApi('/app');
type Data = Awaited<ReturnType<typeof getDashboard>>;
const SITE_SHAPE: Record<string, Shape> = { active: 'progress', suspended: 'blocked', done: 'done', pending: 'todo' };

function Today() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const { viewer } = layout.useLoaderData();
  const first = viewer.name.split(' ')[0];
  const dateLine = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const role = data.role;
  return (
    <div className="stack loose">
      <div className="page-head">
        <div className="grow">
          <h1>{t('dashboard.hello', { name: first })}</h1>
          <p style={{ textTransform: 'capitalize' }} suppressHydrationWarning>{dateLine}</p>
          {data.subscription.plan.code === 'trial' ? (
            <p className={data.subscription.trialExpired ? 'error' : 'muted small'}>
              {data.subscription.trialExpired ? t('dashboard.trialExpired') : t('dashboard.trialEnds', { date: new Intl.DateTimeFormat(locale).format(new Date(data.subscription.trialEndsAt)) })}
            </p>
          ) : null}
          {data.subscription.paymentDue ? <p className="error">{t('settings.paymentDue')} <a href="/app/settings">{t('settings.payNow')}</a></p> : null}
        </div>
      </div>
      {role === 'site_lead' ? <SiteLead data={data} /> : role === 'engineer' ? <Engineer data={data} /> : role === 'accountant' ? <Accountant data={data} /> : <Manager data={data} />}
    </div>
  );
}

// ---------------------------------------------------------------- shared blocks

function ActionCards({ data }: { data: Data }) {
  const { t } = useI18n();
  const mine = alertsFor(data.alerts, data.role);
  return (
    <Panel title={t('today.toHandle')} sub={mine.length ? String(mine.length) : undefined}>
      <AlertList alerts={mine} limit={5} />
    </Panel>
  );
}

function Sites({ data }: { data: Data }) {
  const { t } = useI18n();
  const sites = data.insights.sites.filter((site) => site.status !== 'done');
  return (
    <Panel title={t('today.sites')} actions={<Link to="/app/projects" className="btn ghost small">{t('ui.seeAll')}</Link>} flush>
      {sites.length ? sites.slice(0, 6).map((site) => (
        <Link key={site.id} to="/app/projects/$projectId" params={{ projectId: site.id }} className="row nowrap"
          style={{ padding: '.6rem 1rem', borderBottom: '1px solid var(--divider)', textDecoration: 'none', color: 'inherit', gap: '.75rem' }}>
          <span style={{ width: 52, height: 40, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
            {site.coverId ? <img src={`/api/files/photo/${site.coverId}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <FolderKanban size={18} style={{ color: 'var(--ink-faint)' }} />}
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="trunc" style={{ display: 'block', fontWeight: 600 }}>{site.code} · {site.name}</span>
            <Progress value={site.progressPct} />
          </span>
          <span className="hide-m"><StatusChip shape={site.health === 'critical' ? 'late' : SITE_SHAPE[site.status] ?? 'todo'} label={t(`status.${site.status}` as MessageKey)} /></span>
        </Link>
      )) : <EmptyState icon={FolderKanban} title={t('app.empty')} />}
    </Panel>
  );
}

function Photos({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const view = usePhotoViewer();
  const time = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(value));
  return (
    <Panel title={t('today.photos')} actions={<Link to="/app/documents" className="btn ghost small">{t('ui.seeAll')}</Link>}>
      {data.insights.photos.length ? (
        <div className="photo-strip">
          {data.insights.photos.slice(0, 8).map((photo, index, shown) => (
            <a key={photo.id} className="photo-tile" href={`/api/files/photo/${photo.id}`}
              onClick={(event) => { event.preventDefault(); view(shown.map((item) => ({ url: `/api/files/photo/${item.id}`, title: item.projectCode, detail: `${item.author} · ${time(item.takenAt)}`, href: `/app/projects/${item.projectId}` })), index); }}>
              <img src={`/api/files/photo/${photo.id}`} alt="" loading="lazy" />
              <span className="cap">{photo.projectCode} · {time(photo.takenAt)}</span>
            </a>
          ))}
        </div>
      ) : <EmptyState icon={Camera} title={t('today.noPhotos')} />}
    </Panel>
  );
}

function Weather({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  if (!data.weather.length) return null;
  return (
    <Panel title={t('today.weather')}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {data.weather.map((site) => {
          const tomorrow = site.days[1] ?? site.days[0];
          const wet = (day: { rain: number }) => day.rain >= data.rainLimit;
          return (
            <div key={site.projectId} className="card stack" style={{ gap: '.3rem', padding: '.75rem .9rem', borderColor: site.days.some(wet) ? 'var(--warn)' : undefined }}>
              <b className="small">{site.code}</b>
              <span className="faint xsmall trunc">{site.location}</span>
              {site.days.length ? site.days.map((day) => (
                <span key={day.date} className="row tight nowrap small">
                  {wet(day) ? <CloudRain size={15} style={{ color: 'var(--info)' }} /> : <Sun size={15} style={{ color: 'var(--warn)' }} />}
                  <span style={{ width: 34 }}>{new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`))}</span>
                  <b>{day.max}°</b><span className="faint">{day.rain ? t('today.rain', { n: day.rain }) : t('today.noRain')}</span>
                </span>
              )) : <span className="faint xsmall">—</span>}
              {tomorrow ? <span className={`badge ${wet(tomorrow) ? 'warn' : 'ok'}`} style={{ alignSelf: 'flex-start' }}>{wet(tomorrow) ? t('today.pourNotAdvised') : t('today.pourAdvised')}</span> : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Clients({ data }: { data: Data }) {
  const { t } = useI18n();
  const ago = useRelative();
  const events = data.insights.clientActivity;
  const key = (command: string) => (['message_post', 'milestone_client_sign', 'milestone_client_validate', 'portal_device_verified'].includes(command.replace('.', '_'))
    ? command.replace('.', '_') : 'other');
  return (
    <Panel title={t('today.clients')}>
      {events.length ? (
        <div className="feed lined">
          {events.slice(0, 6).map((event, index) => (
            <div key={index} className="feed-item">
              <Users size={16} style={{ color: 'var(--ink-faint)', marginTop: 3 }} />
              <span className="f-text">{t(`today.events.${key(event.command)}` as MessageKey, { client: event.clientName ?? '—' })}
                {event.projectId ? <> · <Link to="/app/projects/$projectId" params={{ projectId: event.projectId }}>{event.projectName}</Link></> : null}</span>
              <span className="f-time">{ago(event.at)}</span>
            </div>
          ))}
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>{t('today.noClientActivity')}</p>}
    </Panel>
  );
}

// ---------------------------------------------------------------- manager (owner, admin)

function Manager({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const { ask } = Route.useSearch();
  const money = (minor: number) => formatMoney(locale, minor, data.settings.currencyCode);
  const cash = data.insights.cash;
  const monthLabel = (month: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' }).format(new Date(`${month}-15T12:00:00`));
  const cumulative = (values: number[]) => values.reduce<number[]>((acc, value) => [...acc, (acc.at(-1) ?? 0) + value], []);
  const collected = cumulative(cash.map((item) => item.collected));
  const invoiced = cumulative(cash.map((item) => item.invoiced));
  return (
    <>
      <PaymentClaims claims={data.claims} canWrite={data.role !== 'engineer'} onDone={() => { window.location.reload(); }} compact />
      {data.finance ? (
        <div className="grid">
          <KpiTile icon={Wallet} label={t('dashboard.receivable')} value={money(data.finance.receivableMinor)} tone="brand" sub={`${t('dashboard.overdue')} ${money(data.finance.overdueMinor)}`} subTone={data.finance.overdueMinor ? 'bad' : undefined} />
          <KpiTile label={t('today.dueSoon')} value={money(data.finance.dueSoonMinor)} sub={t('today.collectedRate', { pct: data.finance.collectedPct })} />
          {data.cash ? (
            <KpiTile label={t('cash.in', { n: 30 })} value={money(data.cash.d30)} tone={data.cash.d30 < 0 ? 'bad' : undefined}
              sub={data.cash.lowest.balanceMinor < 0 ? t('cash.lowestShort', { amount: money(data.cash.lowest.balanceMinor) }) : t('cash.forecastHint')} subTone={data.cash.lowest.balanceMinor < 0 ? 'bad' : undefined}
              onClick={() => { window.location.href = '/app/finance?tab=cash'; }} />
          ) : <KpiTile label={t('dashboard.cash')} value={money(data.finance.cashMinor)} tone={data.finance.cashMinor < 0 ? 'bad' : undefined} sub={t('today.cashHint')} />}
          <KpiTile label={t('today.projectedMargin')} value={data.finance.projectedMarginPct === null ? '—' : `${data.finance.projectedMarginPct} %`}
            tone={data.finance.projectedMarginPct !== null && data.finance.projectedMarginPct < 10 ? 'bad' : undefined}
            sub={t('today.currentMargin', { pct: data.finance.marginPct ?? 0 })} />
          <KpiTile icon={HardHat} label={t('crew.tile')} value={data.crew.workers} sub={t('crew.tileSub', { sites: data.crew.sites })} onClick={() => { window.location.href = '/app/crew'; }} />
        </div>
      ) : null}
      <div className="grid-main">
        <ActionCards data={data} />
        <Clients data={data} />
      </div>
      <SitesMap sites={data.insights.sites} />
      <AskCard initial={ask} />
      <div className="grid-main">
        {cash.length ? (
          <Panel title={t('today.cashTitle')} sub={t('today.cashSub', { amount: money(collected.at(-1) ?? 0) })}>
            <AreaChart labels={cash.map((item) => monthLabel(item.month))} main={collected} compare={invoiced} locale={locale} label={t('today.cashTitle')} />
            <Legend items={[{ label: t('today.collected'), color: 'var(--brand)' }, { label: t('today.invoiced'), color: 'var(--ink-faint)', dashed: true }]} />
          </Panel>
        ) : <span />}
        <Sites data={data} />
      </div>
      {data.insights.risk.length ? (
        <Panel title={t('today.risk')} sub={t('today.riskSub')} flush>
          <div className="table-wrap"><table>
            <tbody>{data.insights.risk.slice(0, 5).map((client) => (
              <tr key={client.clientId}>
                <td style={{ fontWeight: 600 }}>{client.clientName}</td>
                <td style={{ width: '40%' }}><Progress value={client.score} tone={client.score >= 60 ? 'bad' : client.score >= 30 ? 'warn' : 'ok'} label={false} /></td>
                <td className="num" style={{ fontWeight: 700, color: client.score >= 60 ? 'var(--bad)' : client.score >= 30 ? 'var(--warn)' : 'var(--ok)' }}>{client.score} / 100</td>
                <td className="right muted small">{client.overdueMinor ? `${money(client.overdueMinor)} · ${t('ui.lateDays', { n: client.maxOverdueDays })}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
      ) : null}
      <Photos data={data} />
    </>
  );
}

// ---------------------------------------------------------------- engineer

function Engineer({ data }: { data: Data }) {
  const { t } = useI18n();
  const ops = data.operations;
  const sites = data.insights.sites.filter((site) => site.status === 'active' || site.status === 'suspended');
  const phaseNames = sites[0]?.phases.map((phase) => phase.name) ?? [];
  const late = data.alerts.filter((alert) => alert.kind === 'milestone_late').length;
  return (
    <>
      <div className="grid">
        <KpiTile icon={ClipboardCheck} label={t('desk.inbox')} value={ops.reportsToReview} tone={ops.reportsToReview ? 'brand' : undefined} onClick={() => { window.location.href = '/app/field'; }} />
        <KpiTile icon={TriangleAlert} label={t('dashboard.openIncidents')} value={ops.openIncidents} tone={ops.openIncidents ? 'bad' : undefined} onClick={() => { window.location.href = '/app/field?tab=incidents'; }} />
        <KpiTile icon={CalendarClock} label={t('planning.late')} value={late} tone={late ? 'bad' : undefined} onClick={() => { window.location.href = '/app/planning'; }} />
        <KpiTile icon={Camera} label={t('dashboard.photosWeek')} value={ops.photosWeek} sub={`${t('dashboard.reportsWeek')} ${ops.reportsWeek}`} />
        <KpiTile icon={HardHat} label={t('crew.tile')} value={data.crew.workers} sub={t('crew.tileSub', { sites: data.crew.sites })} onClick={() => { window.location.href = '/app/crew'; }} />
      </div>
      <MaterialRequests canHandle showSite />
      <SitesMap sites={data.insights.sites} />
      <Weather data={data} />
      <div className="grid-main">
        <Panel title={t('today.phases')} flush>
          <div className="table-wrap" style={{ padding: '.75rem 1rem' }}>
            <div className="matrix" style={{ gridTemplateColumns: `minmax(140px, 1.4fr) repeat(${phaseNames.length}, minmax(70px, 1fr))` }}>
              <span />{phaseNames.map((name) => <span key={name} className="m-head">{name}</span>)}
              {sites.map((site) => (
                <Row key={site.id} site={site} />
              ))}
            </div>
          </div>
        </Panel>
        <ActionCards data={data} />
      </div>
      <Photos data={data} />
    </>
  );
}

function Row({ site }: { site: Data['insights']['sites'][number] }) {
  return (
    <>
      <Link to="/app/projects/$projectId" params={{ projectId: site.id }} className="trunc small" style={{ alignSelf: 'center', fontWeight: 600, color: 'inherit' }}>{site.code} · {site.name}</Link>
      {site.phases.map((phase) => (
        <span key={phase.name} className={`m-cell ${phase.progress >= 100 ? 'full' : ''}`} title={`${phase.name} ${phase.progress} %`}>
          <i style={{ width: `${phase.progress}%` }} /><span>{phase.progress}</span>
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- accountant

function Accountant({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const money = (minor: number) => formatMoney(locale, minor, data.settings.currencyCode);
  const thisMonth = data.insights.cash.at(-1)?.collected ?? 0;
  const aging = data.aging;
  const buckets = ['notDue', 'd30', 'd60', 'd90', 'd90plus'] as const;
  const colors = ['#2f5f8a', '#c9932e', '#b9461e', '#9b3818', '#8e2a22'];
  const total = aging ? buckets.reduce((sum, bucket) => sum + aging[bucket].amount, 0) : 0;
  const docs = data.alerts.filter((alert) => alert.kind.startsWith('document_')).length;
  return (
    <>
      <div className="grid">
        <KpiTile icon={Wallet} label={t('today.collectedMonth')} value={money(thisMonth)} tone="brand" onClick={() => { window.location.href = '/app/finance'; }} />
        <KpiTile icon={Receipt} label={t('dashboard.receivable')} value={data.finance ? money(data.finance.receivableMinor) : '—'} />
        <KpiTile icon={TriangleAlert} label={t('dashboard.overdue')} value={data.finance ? money(data.finance.overdueMinor) : '—'} tone={data.finance?.overdueMinor ? 'bad' : undefined} />
        <KpiTile icon={FileText} label={t('docs.toFix')} value={docs} tone={docs ? 'bad' : undefined} />
      </div>
      {aging ? (
        <Panel title={t('fin.agingTitle')} sub={money(total)}>
          <div className="stackbar" style={{ height: 14 }}>{buckets.map((bucket, index) => <i key={bucket} style={{ width: `${total ? (aging[bucket].amount / total) * 100 : 0}%`, background: colors[index] }} />)}</div>
          <div className="legend" style={{ marginTop: '.6rem' }}>{buckets.map((bucket, index) => <span key={bucket}><i style={{ ['--c' as string]: colors[index] }} />{t(`finance.aging.${bucket}`)} · <b>{money(aging[bucket].amount)}</b></span>)}</div>
        </Panel>
      ) : null}
      <PaymentClaims claims={data.claims} canWrite onDone={() => { window.location.reload(); }} compact />
      <div className="grid-main">
        <ActionCards data={data} />
        <Panel title={t('today.lastPayments')} flush>
          {data.payments.length ? data.payments.map((payment) => (
            <div key={payment.id} className="row nowrap small" style={{ padding: '.55rem 1rem', borderBottom: '1px solid var(--divider)' }}>
              <span className="grow trunc"><b>{payment.projectName}</b> · {t(`finance.methods.${payment.method as 'other'}`)}</span>
              <span className="faint"><DateText value={payment.receivedOn} /></span><b className="num"><Money minor={payment.amountMinor} currency={payment.currencyCode} /></b>
            </div>
          )) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('app.empty')}</p>}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- site lead

function SiteLead({ data }: { data: Data }) {
  const { t } = useI18n();
  return (
    <>
      <div className="card stack" style={{ alignItems: 'flex-start' }}>
        <HardHat size={32} style={{ color: 'var(--brand)' }} />
        <h2 style={{ margin: 0 }}>{t('today.myDay')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('today.fieldHint')}</p>
        <a href="/field" className="btn large"><HardHat size={18} />{t('today.openField')}</a>
      </div>
      <Weather data={data} />
      <Sites data={data} />
    </>
  );
}
