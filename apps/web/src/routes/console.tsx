// The platform console (specs 027, 038): the operator's figures, every company with its detail
// (members, usage, licences, payments) and gestures (plan, trial, paid period, suspension), the
// licence products of the store mapped to plans, and the operator's journal.
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { Badge, DateText, formatMoney, Tabs } from '@/components/ui.tsx';
import { BarChart } from '@/components/charts.tsx';
import { Drawer, KpiTile, Panel, useToast } from '@/components/kit.tsx';
import { consoleCompanyAction, getConsole, getConsoleCompany, removeLicenseProduct, saveLicenseProduct, setCompanyPlan } from '@/features/settings/server.ts';
import { getShell } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/console')({
  loader: async () => {
    const { viewer } = await getShell();
    if (!viewer?.platformAdmin) throw redirect({ to: '/app' });
    return getConsole();
  },
  component: Console,
});

type Data = Awaited<ReturnType<typeof getConsole>>;
type Tab = 'overview' | 'companies' | 'licenses' | 'journal';

function Console() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="public" style={{ maxWidth: 1240 }}>
      <PublicHeader signedIn />
      <h1>{t('console.title')}</h1>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'overview', label: t('console2.overview') },
        { value: 'companies', label: `${t('console.companies')} · ${data.companies.length}` },
        { value: 'licenses', label: `${t('console2.licenses')} · ${data.products.length}` },
        { value: 'journal', label: t('console2.journal') },
      ]} />
      {tab === 'overview' ? <Overview data={data} /> : null}
      {tab === 'companies' ? <Companies data={data} /> : null}
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
        <KpiTile label={t('platform.mrr')} value={formatMoney(locale, data.revenue.mrrMinor, 'XOF')} tone="brand" sub={t('platform.paying', { n: data.revenue.paying })} />
        <KpiTile label={t('platform.companies')} value={data.revenue.companies} sub={t('platform.trials', { n: data.revenue.trials })} />
        <KpiTile label={t('platform.trialsEnding')} value={data.revenue.trialsEnding} tone={data.revenue.trialsEnding ? 'bad' : undefined} />
        <KpiTile label={t('platform.quiet')} value={data.revenue.quiet.length} sub={t('platform.quietSub')} />
        <KpiTile label={t('console2.licensesUsed')} value={data.redemptions.length} />
      </div>
      <Panel title={t('platform.revenue')}>
        <BarChart categories={data.revenue.months.map((month) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'short' }).format(new Date(`${month.month}-15T12:00:00`)))}
          series={[{ values: data.revenue.months.map((month) => month.amount), color: 'var(--brand)' }]} locale={locale} label={t('platform.revenue')} />
      </Panel>
      {data.revenue.quiet.length ? (
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

function Companies({ data }: { data: Data }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const shown = data.companies.filter((company) => !q.trim() || company.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="stack">
      <div className="search-in" style={{ width: 280 }}><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.search')} aria-label={t('ui.search')} /></div>
      <div className="panel"><div className="table-wrap"><table>
        <thead><tr><th>{t('clientInvite.contactName')}</th><th>{t('console.created')}</th><th>{t('console.plan')}</th><th>{t('console.users')}</th><th>{t('console.projects')}</th><th>{t('console.reports30')}</th></tr></thead>
        <tbody>{shown.map((company) => (
          <tr key={company.orgId} style={{ cursor: 'pointer' }} onClick={() => setOpen(company.orgId)}>
            <td><b>{company.name}</b> <span className="muted small">{company.countryCode}</span></td>
            <td><DateText value={company.createdAt} /></td>
            <td><span className="badge">{company.planCode}</span></td>
            <td>{company.users}</td><td>{company.projects}</td>
            <td><Badge tone={company.reportsLast30Days > 0 ? 'ok' : 'warn'}>{company.reportsLast30Days}</Badge></td>
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
          <p className="faint xsmall">{t('console2.lastActivity', { date: when(company.usage.lastActivity) })}</p>
        </div>
      ) : null}
    </Drawer>
  );
}

function Licenses({ data }: { data: Data }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({ productId: '', planCode: data.plans[0]?.code ?? '', months: 1, label: '', buyUrl: '' });
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  const save = async (product = form) => {
    try { await saveLicenseProduct({ data: { ...product, active: true } }); toast({ text: t('console2.done') }); setForm({ ...form, productId: '', label: '', buyUrl: '' }); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <div className="stack">
      {!data.chariowConfigured ? <p className="notice warn">{t('console2.chariowOff')}</p> : <p className="notice ok small">{t('console2.chariowOn')}</p>}
      <Panel title={t('console2.products')} sub={t('console2.productsSub')}>
        <div className="stack">
          {data.products.map((product) => (
            <div key={product.productId} className="alert-row small">
              <code>{product.productId}</code><b className="grow">{product.label}</b>
              <span>{product.planCode} · {product.months} {t('console2.months')}</span>
              {product.buyUrl ? <a href={product.buyUrl} target="_blank" rel="noreferrer">{t('console2.buyLink')}</a> : null}
              <button type="button" className="btn ghost small" onClick={async () => { await removeLicenseProduct({ data: { productId: product.productId } }); await router.invalidate(); }}>{t('app.remove')}</button>
            </div>
          ))}
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <label className="field">{t('console2.productId')}<input value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} placeholder="prd_…" required /></label>
            <label className="field">{t('console2.label')}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Struo Pro — 12 mois" required /></label>
            <label className="field">{t('console.plan')}<select value={form.planCode} onChange={(event) => setForm({ ...form, planCode: event.target.value })}>{data.plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
            <label className="field">{t('console2.duration')}<input type="number" min={1} max={60} value={form.months} onChange={(event) => setForm({ ...form, months: Number(event.target.value) })} /></label>
            <label className="field">{t('console2.buyUrl')}<input value={form.buyUrl} onChange={(event) => setForm({ ...form, buyUrl: event.target.value })} placeholder="https://…" /></label>
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
