// The platform console (specs 027, 038, 055): what to handle today, true figures, every company
// with where it stands and its detail (members, usage, licences, payments, notes) and gestures
// (plan, trial, paid period, suspension), the plans edited with care, prices, licence products,
// whether the platform runs, announcements, what users report, and the operator's journal.
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { Announcements, CompanyNotes, FeatureGrants, Feedback, McpAccess, PlatformRuns, Plans, Steps, StepsList, Today } from '@/components/ConsoleFounder.tsx';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { Badge, DateText, formatMoney, parseMoney, Tabs } from '@/components/ui.tsx';
import { COUNTRIES, sortedCountries } from '@/features/settings/countries.ts';
import { BarChart } from '@/components/charts.tsx';
import { Drawer, KpiTile, Panel, useToast } from '@/components/kit.tsx';
import { consoleCompanyAction, getConsole, getConsoleCompany, markContactHandled, removeLicenseProduct, saveLicenseProduct, setCompanyPlan, setPlanPrice, saveLicenceSettings, savePublicPrices, saveTrialSettings, saveDemoLimit, resetDemoLimits } from '@/features/settings/server.ts';
import { getShell } from '@/features/shell/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/console')({
  loader: async () => {
    const { viewer } = await getShell();
    if (!viewer?.platformAdmin) throw redirect({ to: '/app' });
    return getConsole();
  },
  component: Console,
});

type Data = Awaited<ReturnType<typeof getConsole>>;
type Tab = 'today' | 'overview' | 'health' | 'platform' | 'leads' | 'companies' | 'plans' | 'prices' | 'licenses' | 'announcements' | 'feedback' | 'mcp' | 'journal';

function Console() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('today');
  const [company, setCompany] = useState<string | null>(null);
  const realCompanies = data.companies.filter((item) => !item.isDemo && !item.isInternal);
  return (
    <div className="public" style={{ maxWidth: 1240 }}>
      <PublicHeader signedIn />
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem' }}>
        <h1 style={{ margin: 0 }}>{t('console.title')}</h1>
        <a className="btn secondary small" href="/onboarding?internal=1">{t('internal.create')}</a>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'today', label: `${t('founder.tab')} · ${data.todo.length}` },
        { value: 'overview', label: t('console2.overview') },
        { value: 'health', label: t('health.tab') },
        { value: 'platform', label: t('founder.platformTab') },
        { value: 'companies', label: `${t('console.companies')} · ${realCompanies.length}` },
        { value: 'leads', label: `${t('leads.tab')} · ${data.leads.filter((lead) => !lead.handledAt).length}` },
        { value: 'plans', label: t('plans.tab') },
        { value: 'prices', label: t('prices.tab') },
        { value: 'licenses', label: `${t('console2.licenses')} · ${data.products.length}` },
        { value: 'announcements', label: t('announce.tab') },
        { value: 'feedback', label: `${t('feedback.tab')} · ${data.feedback.filter((item) => !item.handledAt).length}` },
        { value: 'mcp', label: t('pmcp.tab') },
        { value: 'journal', label: t('console2.journal') },
      ]} />
      {tab === 'mcp' ? <McpAccess keys={data.platformKeys} url={data.mcpUrl} connections={data.oauthConnections} /> : null}
      {tab === 'today' ? <Today todo={data.todo} onOpen={setCompany} /> : null}
      {tab === 'platform' ? <PlatformRuns runs={data.runs} sentryOn={data.sentryOn} /> : null}
      {tab === 'plans' ? <Plans plans={data.editablePlans} /> : null}
      {tab === 'announcements' ? <Announcements items={data.announcements} /> : null}
      {tab === 'feedback' ? <Feedback items={data.feedback} onOpen={setCompany} /> : null}
      {company ? <CompanyDrawer orgId={company} plans={data.plans} onClose={() => setCompany(null)} /> : null}
      {tab === 'overview' ? <Overview data={data} /> : null}
      {tab === 'health' ? <Health data={data} /> : null}
      {tab === 'companies' ? <Companies data={data} /> : null}
      {tab === 'leads' ? <Leads data={data} /> : null}
      {tab === 'prices' ? <Prices data={data} /> : null}
      {tab === 'licenses' ? <Licenses data={data} /> : null}
      {tab === 'journal' ? <Journal data={data} /> : null}
    </div>
  );
}

function Overview({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  return (
    <div className="stack">
      <div className="grid">
        <KpiTile label={t('platform.mrr')} value={data.money.mrr.length ? data.money.mrr.map((row) => formatMoney(locale, row.amountMinor, row.currency)).join(' · ') : formatMoney(locale, 0, 'XOF')} tone="brand" sub={t('platform.paying', { n: data.money.paying })} />
        <KpiTile label={t('platform.companies')} value={data.money.companies} sub={t('platform.trials', { n: data.money.trials })} />
        <KpiTile label={t('platform.trialsEnding')} value={data.revenue.trialsEnding} tone={data.revenue.trialsEnding ? 'bad' : undefined} />
        <KpiTile label={t('platform.quiet')} value={data.todo.filter((item) => item.kind === 'paying_slowing' || item.kind === 'trial_idle').length} sub={t('platform.quietSub')} />
        <KpiTile label={t('console2.licensesUsed')} value={data.redemptions.length} />
      </div>
      <Revenue data={data} />
      {data.revenue.quiet.length && false ? (
        <Panel title={t('platform.quiet')} sub={t('platform.quietSub')}>
          {data.revenue.quiet.map((company) => (
            <div key={company.orgId} className="alert-row"><span className="grow"><b>{company.name}</b></span>
              <span className="muted small">{company.lastReport ? t('platform.lastReport', { date: new Intl.DateTimeFormat(locale).format(new Date(company.lastReport)) }) : t('platform.noReport')}</span></div>
          ))}
        </Panel>
      ) : null}
    </div>
  );
}

/** Spec 055: revenue per month, one currency at a time (never added across currencies), licences included. */
function Revenue({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const currencies = [...new Set(data.money.months.map((row) => row.currency))];
  const [currency, setCurrency] = useState(currencies[0] ?? 'XOF');
  const months = [...Array(6)].map((_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - 5 + index); return date.toISOString().slice(0, 7); });
  return (
    <Panel title={t('platform.revenue')} sub={t('founder.revenueSub')} actions={currencies.length > 1 ? (
      <select value={currency} onChange={(event) => setCurrency(event.target.value)} style={{ width: 'auto' }} aria-label={t('prices.currency')}>{currencies.map((code) => <option key={code}>{code}</option>)}</select>) : null}>
      <BarChart categories={months.map((month) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' }).format(new Date(`${month}-15T12:00:00`)))}
        series={[{ values: months.map((month) => data.money.months.find((row) => row.month === month && row.currency === currency)?.amountMinor ?? 0), color: 'var(--brand)' }]} locale={locale} label={t('platform.revenue')} />
      {!data.money.months.length ? <p className="small muted" style={{ margin: 0 }}>{t('founder.noRevenue')}</p> : null}
    </Panel>
  );
}

function Companies({ data }: { data: Data }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [demos, setDemos] = useState(false);
  const shown = data.companies.filter((company) => (demos || !company.isDemo) && (!q.trim() || company.name.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="stack">
      <div className="row"><div className="search-in" style={{ width: 280 }}><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.search')} aria-label={t('ui.search')} /></div>
        <label className="check small"><input type="checkbox" checked={demos} onChange={(event) => setDemos(event.target.checked)} />{t('founder.showDemos')}</label></div>
      <div className="panel"><div className="table-wrap"><table>
        <thead><tr><th>{t('clientInvite.contactName')}</th><th>{t('console.created')}</th><th>{t('console.plan')}</th><th>{t('console.users')}</th><th>{t('console.projects')}</th><th>{t('console.reports30')}</th><th>{t('founder.stepsTitle')}</th><th /></tr></thead>
        <tbody>{shown.map((company) => (
          <tr key={company.orgId} style={{ cursor: 'pointer' }} onClick={() => setOpen(company.orgId)}>
            <td><b>{company.name}</b> <span className="muted small">{company.countryCode}</span>{company.isDemo ? <> <Badge>{t('founder.demo')}</Badge></> : null}{company.isInternal ? <> <Badge tone="info">{t('internal.badge')}</Badge></> : null}{company.suspended ? <> <Badge tone="bad">{t('founder.suspended')}</Badge></> : null}</td>
            <td><DateText value={company.createdAt} /></td>
            <td><span className="badge">{company.planCode}</span></td>
            <td>{company.users}</td><td>{company.projects}</td>
            <td><Badge tone={company.reportsLast30Days > 0 ? 'ok' : 'warn'}>{company.reportsLast30Days}</Badge></td>
            <td><Steps steps={data.onboarding[company.orgId]} /></td>
            <td className="nowrap" onClick={(event) => event.stopPropagation()}>
              {company.ownerEmail ? <a className="btn ghost small" href={`mailto:${company.ownerEmail}`} aria-label={company.ownerEmail}><Mail size={14} /></a> : null}
              {company.phone ? <a className="btn ghost small" href={`https://wa.me/${company.phone.replace(/[^\d]/gu, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={14} /></a> : null}
            </td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {open ? <CompanyDrawer orgId={open} plans={data.plans} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function CompanyDrawer({ orgId, plans, onClose }: { orgId: string; plans: Data['plans']; onClose: () => void }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [company, setCompany] = useState<Awaited<ReturnType<typeof getConsoleCompany>> | null>(null);
  const [reason, setReason] = useState('');
  const load = () => getConsoleCompany({ data: { orgId } }).then(setCompany);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [orgId]);
  const act = async (work: () => Promise<unknown>) => {
    try { await work(); toast({ text: t('console2.done') }); await load(); await router.invalidate(); } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const when = (value: unknown) => (value ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(String(value))) : '—');
  return (
    <Drawer open onClose={onClose} wide title={company ? String(company.name) : t('ui.loading')}>
      {company ? (
        <div className="stack loose">
          <div className="grid">
            <KpiTile label={t('console.plan')} value={String(company.planCode)} sub={company.paidUntil ? t('console2.paidUntil', { date: when(company.paidUntil) }) : t('console2.trialUntil', { date: when(company.trialEndsAt) })} />
            <KpiTile label={t('console.projects')} value={company.usage.projects} sub={t('console2.reports30', { n: company.usage.reports30 })} />
            <KpiTile label={t('console2.invoices')} value={company.usage.invoices} />
            <KpiTile label={t('console2.ai')} value={company.usage.aiTurns} sub={formatMoney(locale, company.usage.aiCents, 'USD')} />
          </div>
          {company.suspendedAt ? <p className="notice warn">{t('console2.suspended', { date: when(company.suspendedAt), reason: String(company.suspendedReason ?? '') })}</p> : null}
          <Panel title={t('console2.gestures')}>
            <div className="stack">
              <label className="row tight small">{t('console.setPlan')}
                <select defaultValue={String(company.planCode)} style={{ width: 'auto' }} onChange={(event) => void act(() => setCompanyPlan({ data: { orgId, planCode: event.target.value } }))}>
                  {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}<option value="trial">trial</option>
                </select>
              </label>
              <div className="row tight">
                <button type="button" className="btn secondary small" onClick={() => void act(() => consoleCompanyAction({ data: { orgId, action: 'trial', days: 14 } }))}>{t('console2.trial14')}</button>
                <button type="button" className="btn secondary small" onClick={() => void act(() => consoleCompanyAction({ data: { orgId, action: 'paid', months: 1 } }))}>{t('console2.paid1')}</button>
              </div>
              <label className="check small"><input type="checkbox" checked={Boolean(company.isInternal)} onChange={(event) => void act(() => consoleCompanyAction({ data: { orgId, action: event.target.checked ? 'internal' : 'external' } }))} />{t('internal.toggle')}</label>
              <p className="xsmall muted" style={{ margin: 0 }}>{t('internal.help')}</p>
              {company.suspendedAt ? (
                <button type="button" className="btn small" onClick={() => void act(() => consoleCompanyAction({ data: { orgId, action: 'reactivate' } }))}>{t('console2.reactivate')}</button>
              ) : (
                <div className="row tight nowrap">
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('console2.reason')} maxLength={300} style={{ flex: 1, minWidth: 0 }} />
                  <button type="button" className="btn danger small" onClick={() => void act(() => consoleCompanyAction({ data: { orgId, action: 'suspend', reason } }))}>{t('console2.suspend')}</button>
                </div>
              )}
            </div>
          </Panel>
          <Panel title={t('console.users')} flush>
            <div className="table-wrap"><table><tbody>{(company.members as { name: string; email: string; role: string; joinedAt: string }[]).map((member) => (
              <tr key={member.email}><td><b>{member.name}</b></td><td className="muted small">{member.email}</td><td>{t(`roles.${member.role as 'owner'}`)}</td><td className="muted small">{when(member.joinedAt)}</td></tr>
            ))}</tbody></table></div>
          </Panel>
          <Panel title={t('console2.licenses')}>
            {(company.redemptions as { maskedKey: string; productId: string; months: number; redeemedAt: string; paidUntil: string }[]).length
              ? (company.redemptions as { maskedKey: string; productId: string; months: number; redeemedAt: string; paidUntil: string }[]).map((item) => (
                <div key={item.maskedKey + item.redeemedAt} className="alert-row small"><code>{item.maskedKey}</code><span className="grow">{item.productId} · {item.months} {t('console2.months')}</span><span className="muted">{when(item.redeemedAt)} → {when(item.paidUntil)}</span></div>
              )) : <p className="muted small" style={{ margin: 0 }}>{t('console2.noLicense')}</p>}
          </Panel>
          <StepsList steps={company.steps} />
          <FeatureGrants orgId={orgId} grants={company.grants} onSaved={load} />
          <CompanyNotes orgId={orgId} notes={company.notes} onSaved={load} />
          <p className="faint xsmall">{t('console2.lastActivity', { date: when(company.usage.lastActivity) })}</p>
        </div>
      ) : null}
    </Drawer>
  );
}

/** Spec 045: prospects who asked to be called back from the site. */
function Leads({ data }: { data: Data }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const handle = async (id: string) => {
    try { await markContactHandled({ data: { id } }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <Panel title={t('leads.title')} sub={t('leads.sub')} flush>
      {data.leads.length ? (
        <div className="table-wrap"><table><tbody>{data.leads.map((lead) => (
          <tr key={lead.id} className={lead.handledAt ? 'muted' : undefined}>
            <td className="nowrap small">{when(lead.createdAt)}</td>
            <td><b>{lead.company ?? lead.name}</b>{lead.company ? <div className="small">{lead.name}</div> : null}</td>
            <td><code>{lead.reach}</code></td>
            <td className="small">{lead.countryCode ?? ''}{lead.activeSites !== null ? ` · ${t('leads.sites', { n: lead.activeSites })}` : ''}</td>
            <td className="small" style={{ maxWidth: 360 }}>{lead.message ?? ''}</td>
            <td className="right">{lead.handledAt ? <Badge>{t('leads.handled')}</Badge> : <button type="button" className="btn ghost small" onClick={() => void handle(lead.id)}>{t('leads.markHandled')}</button>}</td>
          </tr>
        ))}</tbody></table></div>
      ) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('leads.none')}</p>}
    </Panel>
  );
}

/**
 * Spec 045: one price per plan and currency. The public page shows the visitor's country currency;
 * a plan without a price there is shown on quote, never converted from another currency.
 */
/** Spec 072: the demo limit per address and per day (0: no limit), and lifting today's counts. */
function DemoLimitPanel({ value }: { value: number }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [perDay, setPerDay] = useState(value);
  const run = async (work: () => Promise<unknown>) => {
    try { await work(); toast({ text: t('console2.done') }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <Panel title={t('demoLimit.title')} sub={perDay === 0 ? t('demoLimit.unlimited') : t('demoLimit.limited', { n: perDay })}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => saveDemoLimit({ data: { perDay } })); }}>
        <label className="field">{t('demoLimit.perDay')}<input type="number" min={0} max={1000} value={perDay} onChange={(event) => setPerDay(Number(event.target.value))} /></label>
        <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('demoLimit.note')}</p>
        <div className="row" style={{ gap: '.6rem', flexWrap: 'wrap' }}>
          <button type="submit" className="btn small">{t('app.save')}</button>
          <button type="button" className="btn secondary small" onClick={() => { setPerDay(0); void run(() => saveDemoLimit({ data: { perDay: 0 } })); }}>{t('demoLimit.open')}</button>
          <button type="button" className="btn ghost small" onClick={() => void run(() => resetDemoLimits())}>{t('demoLimit.reset')}</button>
        </div>
      </form>
    </Panel>
  );
}

/** Spec 072: the free trial offered to new companies, and whether the site shows it. */
function TrialPanel({ value }: { value: { days: number; public: boolean } }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(value);
  const save = async (next = form) => {
    try { await saveTrialSettings({ data: next }); toast({ text: t('console2.done') }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <Panel title={t('trialCfg.title')} sub={form.public ? t('trialCfg.onHelp', { n: form.days }) : t('trialCfg.offHelp')}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="field">{t('trialCfg.days')}<input type="number" min={1} max={90} value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) })} /></label>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.public} onChange={(event) => setForm({ ...form, public: event.target.checked })} />{t('trialCfg.public')}</label>
        <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('trialCfg.note')}</p>
        <div><button type="submit" className="btn small">{t('app.save')}</button></div>
      </form>
    </Panel>
  );
}

function Prices({ data }: { data: Data }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const paid = data.plans.filter((plan) => plan.code !== 'trial' && plan.code !== 'enterprise');
  const currencies = [...new Set(Object.values(COUNTRIES).map((item) => item.currency))].sort();
  const countriesOf = (currency: string) => sortedCountries(locale).filter((item) => item.currency === currency).map((item) => item.name).join(', ');
  const priceOf = (planCode: string, currency: string) => data.prices.find((price) => price.planCode === planCode && price.currencyCode === currency)?.priceMinor ?? null;
  const save = async (planCode: string, currency: string, text: string) => {
    const priceMinor = text.trim() === '' ? null : parseMoney(text, currency);
    if (text.trim() !== '' && (priceMinor === null || priceMinor <= 0)) { toast({ text: t('prices.invalid'), kind: 'err' }); return; }
    if (priceMinor === priceOf(planCode, currency)) return;
    try { await setPlanPrice({ data: { planCode, currencyCode: currency, priceMinor } }); toast({ text: t('console2.done') }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const missing = currencies.filter((currency) => paid.some((plan) => priceOf(plan.code, currency) === null)).length;
  const togglePublic = async () => {
    try { await savePublicPrices({ data: { on: !data.publicPrices } }); toast({ text: t('console2.done') }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <div className="stack">
      <TrialPanel value={data.trial} />
      <DemoLimitPanel value={data.demoLimit} />
      <Panel title={t('prices.publicTitle')} sub={data.publicPrices ? t('prices.publicOnHelp') : t('prices.publicOffHelp')}>
        <div className="row" style={{ flexWrap: 'wrap', gap: '.8rem' }}>
          <Badge tone={data.publicPrices ? 'ok' : 'warn'}>{data.publicPrices ? t('prices.publicOn') : t('prices.publicOff')}</Badge>
          <button type="button" className="btn small" onClick={() => void togglePublic()}>{data.publicPrices ? t('prices.showQuote') : t('prices.showPrices')}</button>
        </div>
      </Panel>
      <p className={`notice ${missing ? 'warn' : 'ok'} small`}>{missing ? t('prices.missing', { n: missing }) : t('prices.complete')}</p>
      <Panel title={t('prices.title')} sub={t('prices.sub')} flush>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('prices.currency')}</th>{paid.map((plan) => <th key={plan.code} className="right">{plan.name} {t('landing.perMonth')}</th>)}</tr></thead>
          <tbody>{currencies.map((currency) => (
            <tr key={currency}>
              <td><b>{currency}</b><div className="faint xsmall trunc" style={{ maxWidth: 360 }}>{countriesOf(currency)}</div></td>
              {paid.map((plan) => {
                const current = priceOf(plan.code, currency);
                return (
                  <td key={plan.code} className="right">
                    <input key={`${plan.code}-${currency}-${current ?? ''}`} inputMode="decimal" aria-label={`${plan.name} ${currency}`} style={{ width: 140, textAlign: 'right' }}
                      defaultValue={current === null ? '' : formatMoney(locale, current, currency).replace(/[^\d,.\s]/gu, '').trim()}
                      placeholder={t('prices.onQuote')}
                      onBlur={(event) => void save(plan.code, currency, event.currentTarget.value)} />
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>
    </div>
  );
}

/** Spec 060: warn N days before the end, then keep everything open for N days, then read-only. */
function LicenceLifecycle({ value }: { value: { warnDays: number; graceDays: number } }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(value);
  const save = async () => {
    try { await saveLicenceSettings({ data: form }); toast({ text: t('console2.done') }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <Panel title={t('licence.console.title')} sub={t('licence.console.sub')}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="field">{t('licence.console.warn')}<input type="number" min={0} max={60} value={form.warnDays} onChange={(event) => setForm({ ...form, warnDays: Number(event.target.value) })} /></label>
        <label className="field">{t('licence.console.grace')}<input type="number" min={0} max={90} value={form.graceDays} onChange={(event) => setForm({ ...form, graceDays: Number(event.target.value) })} /></label>
        <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('licence.console.explain', { warn: form.warnDays, grace: form.graceDays })}</p>
        <div><button type="submit" className="btn small">{t('app.save')}</button></div>
      </form>
    </Panel>
  );
}

function Licenses({ data }: { data: Data }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const empty = { productId: '', planCode: data.plans[0]?.code ?? '', months: 1, label: '', buyUrl: '', description: '', descriptionEn: '', highlight: false, position: 0 };
  const [form, setForm] = useState(empty);
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  const save = async (product = form) => {
    try { await saveLicenseProduct({ data: { ...product, description: product.description || null, descriptionEn: product.descriptionEn || null, active: true } }); toast({ text: t('console2.done') }); setForm(empty); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <div className="stack">
      {!data.chariowConfigured ? <p className="notice warn">{t('console2.chariowOff')}</p> : <p className="notice ok small">{t('console2.chariowOn')}</p>}
      <Panel title={t('pulse.console.title')} sub={t('pulse.console.sub')}>
        <div className="stack">
          <div><b className="small">{t('pulse.console.url')}</b><div className="secret" style={{ userSelect: 'all' }}>{data.pulseUrl}</div></div>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '.25rem' }}>
            <li>{t('pulse.console.step1')}</li><li>{t('pulse.console.step2')}</li><li>{t('pulse.console.step3')}</li>
          </ol>
          <p className={`notice ${data.pulseConfigured ? 'ok' : 'warn'} small`} style={{ margin: 0 }}>{data.pulseConfigured ? t('pulse.console.on') : t('pulse.console.off')}</p>
          {data.pulses.length ? (
            <div className="table-wrap"><table><tbody>{data.pulses.map((item) => (
              <tr key={item.deliveryId}>
                <td className="small muted">{item.at}</td><td><code>{item.event}</code></td>
                <td><Badge tone={item.outcome === 'applied' ? 'ok' : item.outcome === 'failed' || item.outcome === 'unmatched' ? 'bad' : 'neutral'}>{t(`pulse.outcome.${item.outcome}` as MessageKey)}</Badge></td>
                <td className="small">{item.companyName ?? item.buyerEmail ?? ''}{item.detail ? <div className="muted">{item.detail}</div> : null}</td>
              </tr>
            ))}</tbody></table></div>
          ) : <p className="muted small" style={{ margin: 0 }}>{t('pulse.console.none')}</p>}
        </div>
      </Panel>
      <LicenceLifecycle value={data.licenceSettings} />
      <Panel title={t('console2.products')} sub={t('console2.productsSub')}>
        <div className="stack">
          {data.products.map((product) => (
            <div key={product.productId} className="alert-row small">
              <code>{product.productId}</code><b className="grow">{product.label}</b>
              <span>{product.planCode} · {product.months} {t('console2.months')}</span>
              {product.highlight ? <Badge tone="brand">{t('lp.offer.recommended')}</Badge> : null}
              {product.buyUrl ? <a href={product.buyUrl} target="_blank" rel="noreferrer">{t('console2.buyLink')}</a> : null}
              <button type="button" className="btn ghost small" onClick={() => setForm({ productId: product.productId, planCode: product.planCode, months: product.months, label: product.label, buyUrl: product.buyUrl ?? '', description: product.description ?? '', descriptionEn: product.descriptionEn ?? '', highlight: product.highlight, position: product.position })}>{t('plans.edit')}</button>
              <button type="button" className="btn ghost small" onClick={async () => { await removeLicenseProduct({ data: { productId: product.productId } }); await router.invalidate(); }}>{t('app.remove')}</button>
            </div>
          ))}
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <label className="field">{t('console2.productId')}<input value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} placeholder="prd_…" required /></label>
            <label className="field">{t('console2.label')}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Struo Pro — 12 mois" required /></label>
            <label className="field">{t('console.plan')}<select value={form.planCode} onChange={(event) => setForm({ ...form, planCode: event.target.value })}>{data.plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
            <label className="field">{t('console2.duration')}<input type="number" min={1} max={60} value={form.months} onChange={(event) => setForm({ ...form, months: Number(event.target.value) })} /></label>
            <label className="field">{t('console2.buyUrl')}<input value={form.buyUrl} onChange={(event) => setForm({ ...form, buyUrl: event.target.value })} placeholder="https://…" /></label>
            <label className="field">{t('console2.description')} (FR)<textarea rows={4} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="field">{t('console2.description')} (EN)<textarea rows={4} maxLength={2000} value={form.descriptionEn} onChange={(event) => setForm({ ...form, descriptionEn: event.target.value })} /></label>
            <label className="field">{t('plans.position')}<input type="number" min={0} max={100} value={form.position} onChange={(event) => setForm({ ...form, position: Number(event.target.value) })} /></label>
            <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.highlight} onChange={(event) => setForm({ ...form, highlight: event.target.checked })} />{t('plans.highlight')}</label>
            <p className="xsmall faint" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('plans.bulletsHint')}</p>
            <div style={{ alignSelf: 'end' }}><button type="submit" className="btn small">{t('console2.addProduct')}</button></div>
          </form>
        </div>
      </Panel>
      <Panel title={t('console2.redemptions')} flush>
        {data.redemptions.length ? (
          <div className="table-wrap"><table><tbody>{(data.redemptions as { maskedKey: string; productId: string; planCode: string; months: number; redeemedAt: string; paidUntil: string; customerEmail: string | null; companyName: string }[]).map((item) => (
            <tr key={item.maskedKey + item.redeemedAt}><td><code>{item.maskedKey}</code></td><td><b>{item.companyName}</b></td><td>{item.planCode} · {item.months} {t('console2.months')}</td>
              <td className="muted small">{item.customerEmail ?? ''}</td><td className="muted small">{when(item.redeemedAt)} → {when(item.paidUntil)}</td></tr>
          ))}</tbody></table></div>
        ) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('console2.noLicense')}</p>}
      </Panel>
    </div>
  );
}

function Journal({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  return (
    <Panel title={t('console2.journal')} flush>
      {data.journal.length ? (
        <div className="table-wrap"><table><tbody>{(data.journal as { at: string; command: string; companyName: string | null; adminEmail: string | null; detail: unknown }[]).map((row, index) => (
          <tr key={index}><td className="muted small nowrap">{new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.at))}</td>
            <td><code className="small">{row.command}</code></td><td>{row.companyName ?? ''}</td><td className="muted small">{row.adminEmail ?? ''}</td>
            <td className="faint xsmall trunc" style={{ maxWidth: 320 }}>{row.detail ? JSON.stringify(row.detail) : ''}</td></tr>
        ))}</tbody></table></div>
      ) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('ai.page.noJournal')}</p>}
    </Panel>
  );
}

/** Product health (spec 041): is Struo used? Real companies only; the north star first. */
function Health({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const h = data.health;
  const pct = (value: number | null) => (value === null ? '—' : `${value} %`);
  const weeks = h.weeks.map((week) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${week.week}T12:00:00`)));
  const last = h.weeks.at(-1);
  return (
    <div className="stack">
      <Panel title={t('health.northStar')} sub={t('health.northStarSub')}>
        <div className="grid" style={{ marginBottom: '1rem' }}>
          <KpiTile label={t('health.validatedThisWeek')} value={last?.validated ?? 0} tone="brand" sub={t('health.reportsThisWeek', { n: last?.reports ?? 0 })} />
          <KpiTile label={t('health.reportsPerLead')} value={h.usage.reportsPerLead7 ?? '—'} tone={(h.usage.reportsPerLead7 ?? 0) >= 3 ? undefined : 'bad'} sub={t('health.target3')} />
          <KpiTile label={t('health.activeLeads')} value={h.usage.activeLeads7} sub={t('health.last7')} />
          <KpiTile label={t('health.sitesReported')} value={pct(h.usage.sitesReportedPct)} sub={t('health.ofActiveSites', { n: h.usage.activeSites })} />
        </div>
        <BarChart categories={weeks} locale={locale} label={t('health.northStar')} series={[
          { values: h.weeks.map((week) => week.reports), color: 'var(--line, #c9c6bd)' },
          { values: h.weeks.map((week) => week.validated), color: 'var(--brand)' },
        ]} />
      </Panel>
      <Panel title={t('health.activation')} sub={t('health.activationSub', { n: h.cohortSize, signups: h.signups30 })}>
        <div className="grid">
          <KpiTile label={t('health.firstReport48h')} value={pct(h.activation.firstReport48hPct)} tone="brand" sub={h.activation.medianHoursToFirstReport === null ? t('health.noReportYet') : t('health.median', { n: h.activation.medianHoursToFirstReport })} />
          <KpiTile label={t('health.invitedLead')} value={pct(h.activation.invitedLeadPct)} />
          <KpiTile label={t('health.firstInvoice')} value={pct(h.activation.firstInvoicePct)} />
          <KpiTile label={t('health.invitedClient')} value={pct(h.activation.invitedClientPct)} />
        </div>
      </Panel>
      <Panel title={t('health.retentionRevenue')}>
        <div className="grid">
          <KpiTile label={t('health.week4')} value={pct(h.retention.week4Pct)} sub={t('health.base', { n: h.retention.base })} />
          <KpiTile label={t('health.trialToPaid')} value={pct(h.conversion.trialToPaidPct)} sub={t('health.trialsOver', { n: h.conversion.trialsOver })} />
          <KpiTile label={t('health.realCompanies')} value={h.conversion.companies} sub={t('health.demoExcluded')} />
        </div>
      </Panel>
      <Panel title={t('health.tools')}>
        <ul className="stack tight small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>{data.monitoring.errors ? t('health.errorsOn') : t('health.errorsOff')}</li>
          <li>{data.monitoring.audience ? t('health.audienceOn') : t('health.audienceOff')}</li>
        </ul>
      </Panel>
    </div>
  );
}
