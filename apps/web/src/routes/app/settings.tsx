import { can, ROLES } from '@struo/core/permissions';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Badge, DateText, ErrorText, Field, formData, formatMoney, Tabs, useAction } from '@/components/ui.tsx';
import { Check, Minus } from 'lucide-react';
import { PERMISSIONS, type Permission } from '@struo/core/permissions';
import { Avatar, PageHeader, Panel } from '@/components/kit.tsx';
import {
  addConfigurationItem, createApiKey, getSettingsPage, inviteMember, removeConfigurationItem, removeMember, revokeApiKey,
  eraseCompany, paySubscription, revokeInvitation, revokeMcpConnection, setMemberRole, setPaymentProvider, updateSettings,
} from '@/features/settings/server.ts';
import { InvoiceLookSettings } from '@/components/InvoiceLookSettings.tsx';
import { getLicenseOffer, redeemLicense } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => (typeof search.tab === 'string' ? { tab: search.tab } : {}),
  loader: () => getSettingsPage(),
  component: Settings,
});

type Tab = 'company' | 'invoicing' | 'configuration' | 'members' | 'roles' | 'payments' | 'integrations' | 'subscription' | 'journal' | 'data';
type Data = Awaited<ReturnType<typeof getSettingsPage>>;

function Settings() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>((search.tab as Tab | undefined) ?? 'company');
  const tabs: Tab[] = ['company', ...(can(data.role, 'finance.read') ? ['invoicing' as Tab] : []), 'configuration', 'members', 'roles', 'payments', 'integrations', 'subscription', ...(data.journal.length ? ['journal' as Tab] : []), 'data'];
  return (
    <div className="stack">
      <PageHeader title={t('settings.title')} text={data.settings.name} />
      <Tabs value={tab} onChange={setTab} items={tabs.map((value) => ({ value, label: value === 'roles' ? t('set2.roles') : value === 'journal' ? t('set2.journal') : value === 'invoicing' ? t('inv.settingsTab') : t(`settings.${value}`) }))} />
      {tab === 'company' ? <CompanyTab data={data} /> : null}
      {tab === 'invoicing' ? <InvoiceLookSettings canWrite={can(data.role, 'finance.write')} /> : null}
      {tab === 'configuration' ? <ConfigurationTab data={data} /> : null}
      {tab === 'members' ? <MembersTab data={data} /> : null}
      {tab === 'roles' ? <RolesTab /> : null}
      {tab === 'journal' ? <JournalTab data={data} /> : null}
      {tab === 'payments' ? <PaymentsTab data={data} /> : null}
      {tab === 'integrations' ? <IntegrationsTab data={data} /> : null}
      {tab === 'subscription' ? <SubscriptionTab data={data} /> : null}
      {tab === 'data' ? <DataTab data={data} /> : null}
    </div>
  );
}

function CompanyTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [saved, setSaved] = useState(false);
  const s = data.settings;
  const disabled = !can(data.role, 'org.manage');
  return (
    <form
      className="card stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const v = formData(event.currentTarget);
        setSaved(false);
        const done = await run(() =>
          updateSettings({
            data: {
              name: v.name, countryCode: v.countryCode?.toUpperCase(), currencyCode: v.currencyCode?.toUpperCase(),
              vatBps: Math.round(Number(v.vat?.replace(',', '.')) * 100), retentionBps: Math.round(Number(v.retention?.replace(',', '.')) * 100),
              locale: v.locale, alertDocDays: (v.docDays ?? '').split(',').map((d) => Number(d.trim())).filter((d) => d > 0),
              alertLateDays: Number(v.lateDays), alertGapPoints: Number(v.gapPoints), brandColor: v.brandColor || null,
            },
          }),
        );
        if (done) setSaved(true);
      }}
    >
      <fieldset disabled={disabled} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label={t('onboarding.companyName')}>
            <input name="name" defaultValue={s.name} required />
          </Field>
          <Field label={t('onboarding.country')}>
            <input name="countryCode" defaultValue={s.countryCode} maxLength={2} required />
          </Field>
          <Field label={t('onboarding.currency')}>
            <input name="currencyCode" defaultValue={s.currencyCode} maxLength={3} required />
          </Field>
          <Field label={t('onboarding.vat')}>
            <input name="vat" defaultValue={String(s.vatBps / 100)} inputMode="decimal" required />
          </Field>
          <Field label={t('onboarding.retention')}>
            <input name="retention" defaultValue={String(s.retentionBps / 100)} inputMode="decimal" required />
          </Field>
          <Field label={t('onboarding.locale')}>
            <select name="locale" defaultValue={s.locale}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        <h3>{t('settings.alertThresholds')}</h3>
        <div className="form-grid">
          <Field label={t('settings.docDays')}>
            <input name="docDays" defaultValue={s.alertDocDays.join(', ')} />
          </Field>
          <Field label={t('settings.lateDays')}>
            <input name="lateDays" type="number" min={0} defaultValue={s.alertLateDays} />
          </Field>
          <Field label={t('settings.gapPoints')}>
            <input name="gapPoints" type="number" min={0} max={100} defaultValue={s.alertGapPoints} />
          </Field>
          <Field label={t('settings.brandColor')}>
            <input name="brandColor" type="color" defaultValue={s.brandColor ?? '#b9461e'} />
          </Field>
        </div>
        <ErrorText error={error} />
        {saved ? <p className="notice ok">{t('app.saved')}</p> : null}
        <button className="btn" disabled={busy}>
          {t('app.save')}
        </button>
      </fieldset>
    </form>
  );
}

function ConfigurationTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error } = useAction();
  const editable = can(data.role, 'org.manage');
  const lists = [
    { kind: 'projectType' as const, title: t('settings.projectTypes'), items: data.configuration.projectTypes.map((i) => ({ id: i.id, label: i.name })) },
    { kind: 'phase' as const, title: t('settings.phaseTemplates'), items: data.configuration.phases.map((i) => ({ id: i.id, label: i.name })) },
    {
      kind: 'docType' as const,
      title: t('settings.docTypes'),
      items: data.configuration.docTypes.map((i) => ({ id: i.id, label: `${i.name}${i.hasExpiry ? ` (${t('settings.hasExpiry')})` : ''}` })),
    },
  ];
  return (
    <div className="grid">
      {lists.map((list) => (
        <section key={list.kind} className="card stack">
          <h2>{list.title}</h2>
          {list.items.map((item) => (
            <div key={item.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{item.label}</span>
              {editable ? (
                <button type="button" className="btn ghost small" onClick={() => run(() => removeConfigurationItem({ data: { kind: list.kind, id: item.id } }))}>
                  {t('app.remove')}
                </button>
              ) : null}
            </div>
          ))}
          {editable ? (
            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const v = formData(form);
                const done = await run(() => addConfigurationItem({ data: { kind: list.kind, name: v.name, hasExpiry: v.hasExpiry === 'on' } }));
                if (done) form.reset();
              }}
            >
              <input name="name" required maxLength={80} placeholder={t('clientInvite.contactName')} />
              {list.kind === 'docType' ? (
                <label className="check">
                  <input type="checkbox" name="hasExpiry" /> {t('settings.hasExpiry')}
                </label>
              ) : null}
              <button className="btn secondary small">{t('app.add')}</button>
            </form>
          ) : null}
        </section>
      ))}
      <ErrorText error={error} />
    </div>
  );
}

function MembersTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [link, setLink] = useState<string | null>(null);
  const manage = can(data.role, 'members.manage');
  return (
    <div className="stack">
      <section className="card table-wrap">
        <h2>{t('settings.members')}</h2>
        <table>
          <tbody>
            {data.members.map((member) => (
              <tr key={member.memberId}>
                <td>
                  <strong>{member.name}</strong>
                  <div className="muted small">{member.email}</div>
                </td>
                <td>
                  {manage && member.userId !== data.userId ? (
                    <select defaultValue={member.role} onChange={(event) => void run(() => setMemberRole({ data: { memberId: member.memberId, role: event.target.value } }))} aria-label={t('settings.role')}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge>{t(`roles.${member.role}`)}</Badge>
                  )}
                </td>
                <td className="right">
                  {manage && member.userId !== data.userId ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        if (window.confirm(`${t('settings.removeMember')} ${member.name} ?`)) void run(() => removeMember({ data: { memberId: member.memberId } }));
                      }}
                    >
                      {t('settings.removeMember')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {manage ? (
        <section className="card stack">
          <h2>{t('settings.invite')}</h2>
          <form
            className="row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const v = formData(form);
              const result = await run(() => inviteMember({ data: { email: v.email ?? '', role: v.role ?? 'site_lead' } }));
              if (result) {
                setLink(result.url);
                form.reset();
              }
            }}
          >
            <input name="email" type="email" required placeholder={t('app.email')} style={{ maxWidth: 300 }} />
            <select name="role" defaultValue="site_lead" style={{ maxWidth: 220 }}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
            <button className="btn" disabled={busy}>
              {t('settings.invite')}
            </button>
          </form>
          {link ? (
            <div className="notice ok stack">
              <span>{t('settings.inviteSent')}</span>
              <div className="secret">{link}</div>
              <button type="button" className="btn secondary small" onClick={() => void navigator.clipboard.writeText(link)}>
                {t('app.copy')}
              </button>
            </div>
          ) : null}
          {data.invitations.length ? (
            <>
              <h3>{t('settings.invitations')}</h3>
              {data.invitations.map((invitation) => (
                <div key={invitation.id} className="alert-row">
                  <span className="grow">
                    {invitation.email} · {t(`roles.${invitation.role}`)} · <span className="muted small">{`${data.baseUrl}/invite/${invitation.id}`}</span>
                  </span>
                  <button type="button" className="btn ghost small" onClick={() => run(() => revokeInvitation({ data: { id: invitation.id } }))}>
                    {t('app.remove')}
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </section>
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}

function PaymentsTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [saved, setSaved] = useState(false);
  const editable = can(data.role, 'org.manage');
  return (
    <form
      className="card stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const v = formData(event.currentTarget);
        setSaved(false);
        const done = await run(() =>
          setPaymentProvider({ data: { provider: v.provider ?? 'moneroo', secretKey: v.secretKey, webhookSecret: v.webhookSecret, enabled: v.enabled === 'on' } }),
        );
        if (done) setSaved(true);
      }}
    >
      <h2>{t('settings.payments')}</h2>
      <p className="muted">{t('settings.providerHelp')}</p>
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <Field label={t('settings.provider')}>
          <select name="provider" defaultValue={data.provider?.provider ?? 'moneroo'}>
            <option value="moneroo">Moneroo (TMoney, Flooz, cartes…)</option>
            {data.simulatorAvailable ? <option value="simulator">Simulator (test)</option> : null}
          </select>
        </Field>
        <Field label={t('settings.secretKey')} hint={data.provider?.hasSecret ? t('settings.keepSecret') : undefined}>
          <input name="secretKey" type="password" autoComplete="off" />
        </Field>
        <Field label={t('settings.webhookSecret')} hint={data.provider?.hasWebhookSecret ? t('settings.keepSecret') : undefined}>
          <input name="webhookSecret" type="password" autoComplete="off" />
        </Field>
        <div>
          <div className="small muted">{t('settings.webhookUrl')}</div>
          <div className="secret">{`${data.baseUrl}/api/payments/webhook/moneroo/${data.orgId}`}</div>
        </div>
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={data.provider?.enabled ?? true} /> {t('settings.enabled')}
        </label>
        <ErrorText error={error} />
        {saved ? <p className="notice ok">{t('app.saved')}</p> : null}
        <button className="btn" disabled={busy}>
          {t('app.save')}
        </button>
      </fieldset>
    </form>
  );
}

function IntegrationsTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [key, setKey] = useState<string | null>(null);
  const manage = can(data.role, 'apikeys.manage');
  const command = `claude mcp add --transport http struo ${data.baseUrl}/mcp --header "Authorization: Bearer ${key ?? '<clé>'}"`;
  return (
    <section className="card stack">
      <h2>{t('settings.apiKeys')}</h2>
      <p className="muted">{t('settings.apiKeysHelp')}</p>
      {manage ? (
        <form
          className="row"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const result = await run(() => createApiKey({ data: { name: formData(form).name ?? '' } }));
            if (result) {
              setKey(result.key);
              form.reset();
            }
          }}
        >
          <input name="name" required maxLength={80} placeholder={t('settings.keyName')} style={{ maxWidth: 300 }} />
          <button className="btn" disabled={busy}>
            {t('settings.newKey')}
          </button>
        </form>
      ) : null}
      {key ? (
        <div className="notice ok stack">
          <span>{t('settings.keyCreated')}</span>
          <div className="secret">{key}</div>
          <button type="button" className="btn secondary small" onClick={() => void navigator.clipboard.writeText(key)}>
            {t('app.copy')}
          </button>
        </div>
      ) : null}
      <div>
        <div className="small muted">{t('settings.mcpHowTo')}</div>
        <div className="secret">{command}</div>
      </div>
      <div>
        <div className="small muted">{t('settings.mcpOauth')}</div>
        <div className="secret">{`${data.baseUrl}/mcp`}</div>
      </div>
      {data.connections.length ? (
        <>
          <h3>{t('settings.connections')}</h3>
          {data.connections.map((connection) => (
            <div key={connection.clientId} className="alert-row">
              <span className="grow">
                <strong>{connection.clientName}</strong> · {connection.userName} · <DateText value={connection.createdAt} />
              </span>
              {connection.mine ? (
                <button type="button" className="btn danger small" onClick={() => run(() => revokeMcpConnection({ data: { clientId: connection.clientId } }))}>
                  {t('settings.revokeKey')}
                </button>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
      {data.keys.map((apiKey) => (
        <div key={apiKey.id} className="alert-row">
          <span className="grow">
            <strong>{apiKey.name}</strong> <code>{apiKey.prefix}…</code> · {apiKey.ownerName}{' '}
            {apiKey.lastUsedAt ? (
              <span className="muted small">
                · {t('settings.lastUsed', { date: '' })}
                <DateText value={apiKey.lastUsedAt} time />
              </span>
            ) : null}
          </span>
          {apiKey.revokedAt ? (
            <Badge tone="bad">{t('portalAdmin.revoked')}</Badge>
          ) : manage ? (
            <button type="button" className="btn danger small" onClick={() => run(() => revokeApiKey({ data: { id: apiKey.id } }))}>
              {t('settings.revokeKey')}
            </button>
          ) : null}
        </div>
      ))}
      <ErrorText error={error} />
    </section>
  );
}

function SubscriptionTab({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const { plan, users, projects, trialEndsAt, paidUntil, paymentDue } = data.subscription;
  const { run, error, busy } = useAction();
  const payable = data.plans.filter((candidate) => candidate.priceMinor > 0);
  const [planCode, setPlanCode] = useState(payable.find((candidate) => candidate.code === plan.code)?.code ?? payable[0]?.code ?? '');
  const [months, setMonths] = useState(1);
  const chosen = payable.find((candidate) => candidate.code === planCode);
  const manage = data.role === 'owner' || data.role === 'admin';
  const date = (value: string) => new Intl.DateTimeFormat(locale).format(new Date(value));
  return (
    <div className="stack">
      <section className="card stack">
        <h2>
          {t('settings.plan')} : <span className="accent">{plan.name}</span>
        </h2>
        <p>{t('settings.usage', { users, projects })}</p>
        <p className="muted">
          {plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')} ·{' '}
          {plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}
        </p>
        {plan.code === 'trial' ? <p>{t('dashboard.trialEnds', { date: date(trialEndsAt) })}</p> : null}
        {paidUntil ? <p>{t('settings.paidUntil', { date: date(paidUntil) })}</p> : null}
        {paymentDue ? <p className="error">{t('settings.paymentDue')}</p> : null}
      </section>
      {manage ? <LicenseSection /> : null}
      {manage && data.platformPayment && payable.length ? (
        <section className="card stack">
          <h2>{t('settings.payPlan')}</h2>
          <div className="form-grid">
            <Field label={t('settings.plan')}>
              <select value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
                {payable.map((candidate) => (
                  <option key={candidate.code} value={candidate.code}>
                    {candidate.name} — {formatMoney(locale, candidate.priceMinor, candidate.currencyCode)} {t('landing.perMonth')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.months')}>
              <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
                {[1, 3, 6, 12].map((value) => (
                  <option key={value} value={value}>
                    {t('settings.monthsCount', { n: value })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {chosen ? (
            <p>
              {t('app.total')} : <strong>{formatMoney(locale, chosen.priceMinor * months, chosen.currencyCode)}</strong>
              {data.platformPayment === 'simulator' ? <span className="muted small"> · {t('settings.simulatorNote')}</span> : null}
            </p>
          ) : null}
          <ErrorText error={error} />
          <button
            type="button"
            className="btn"
            disabled={busy || !chosen}
            onClick={async () => {
              const result = await run(() => paySubscription({ data: { planCode, months } }), { reload: false });
              if (result) window.location.href = result.checkoutUrl;
            }}
          >
            {t('settings.payNow')}
          </button>
        </section>
      ) : (
        <p className="notice info">{t('settings.changePlan')}</p>
      )}
      {data.subscriptionPayments.length ? (
        <section className="card table-wrap">
          <h2>{t('settings.paymentHistory')}</h2>
          <table>
            <tbody>
              {data.subscriptionPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <DateText value={payment.createdAt} />
                  </td>
                  <td>
                    {payment.planName} · {t('settings.monthsCount', { n: payment.months })}
                  </td>
                  <td className="right">{formatMoney(locale, payment.amountMinor, payment.currencyCode)}</td>
                  <td>
                    <Badge tone={payment.status === 'succeeded' ? 'ok' : payment.status === 'pending' ? 'warn' : 'bad'}>
                      {t(`settings.paymentStatus.${payment.status as 'pending'}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function DataTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [confirmName, setConfirmName] = useState('');
  const finance = ['owner', 'admin', 'accountant', 'engineer'].includes(data.role);
  const manage = data.role === 'owner' || data.role === 'admin';
  return (
    <div className="stack">
      {finance ? (
        <section className="card stack">
          <h2>{t('settings.accountingExport')}</h2>
          <p className="muted">{t('settings.accountingHelp')}</p>
          <div className="form-grid">
            <Field label={t('settings.from')}>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label={t('settings.to')}>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
          <div className="row">
            {(['invoices', 'payments', 'expenses'] as const).map((kind) => (
              <a key={kind} className="btn secondary" href={`/api/export/accounting/${kind}?from=${from}&to=${to}`}>
                {t(`settings.exports.${kind}`)}
              </a>
            ))}
          </div>
        </section>
      ) : null}
      {manage ? (
        <section className="card stack">
          <h2>{t('settings.fullExport')}</h2>
          <p className="muted">{t('settings.fullExportHelp')}</p>
          <a className="btn" href="/api/export/company">
            {t('settings.downloadZip')}
          </a>
        </section>
      ) : null}
      {data.role === 'owner' ? (
        <section className="card stack" style={{ borderColor: 'var(--bad)' }}>
          <h2 className="error">{t('settings.erase')}</h2>
          <p>{t('settings.eraseHelp', { name: data.settings.name })}</p>
          <input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} placeholder={data.settings.name} aria-label={t('settings.erase')} />
          <ErrorText error={error} />
          <button
            type="button"
            className="btn danger"
            disabled={busy || confirmName.trim() !== data.settings.name.trim()}
            onClick={async () => {
              if (!window.confirm(t('settings.eraseConfirm'))) return;
              const done = await run(() => eraseCompany({ data: { confirmName } }), { reload: false });
              if (done) window.location.href = '/onboarding';
            }}
          >
            {t('settings.eraseButton')}
          </button>
        </section>
      ) : null}
    </div>
  );
}

/** Who may do what (screen A4): the permission table of the domain, read-only. */
function RolesTab() {
  const { t } = useI18n();
  const permissions = Object.keys(PERMISSIONS) as Permission[];
  return (
    <Panel title={t('set2.roles')} sub={t('set2.rolesSub')} flush>
      <div className="table-wrap"><table>
        <thead><tr><th />{ROLES.map((role) => <th key={role} style={{ textAlign: 'center' }}>{t(`roles.${role}`)}</th>)}</tr></thead>
        <tbody>{permissions.map((permission) => (
          <tr key={permission}>
            <td>{t(`set2.perm.${permission.replace('.', '_')}` as 'set2.roles')}</td>
            {ROLES.map((role) => (
              <td key={role} style={{ textAlign: 'center' }}>{can(role, permission) ? <Check size={17} style={{ color: 'var(--ok)' }} aria-label="✓" /> : <Minus size={15} style={{ color: 'var(--ink-faint)' }} aria-label="—" />}</td>
            ))}
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted small" style={{ padding: '0 1rem 1rem' }}>{t('set2.clientNote')}</p>
    </Panel>
  );
}

/** The company's journal (screen A6): who did what, from which door. */
function JournalTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const rows = data.journal.filter((row) => !q || `${row.actorName} ${row.command} ${row.door}`.toLowerCase().includes(q.toLowerCase()));
  const doorLabel = (door: string) => t(`set2.doors.${door}` as 'set2.roles');
  return (
    <Panel title={t('set2.journal')} sub={t('set2.journalSub')} actions={<input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.search')} style={{ maxWidth: 220, minHeight: 32 }} />} flush>
      <div className="table-wrap"><table>
        <thead><tr><th>{t('app.date')}</th><th>{t('clientInvite.contactName')}</th><th>{t('set2.action')}</th><th>{t('set2.door')}</th></tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id}>
            <td className="nowrap muted"><DateText value={row.at} time /></td>
            <td><span className="row tight nowrap"><Avatar name={row.actorName} />{row.actorName}</span></td>
            <td><code>{row.command}</code></td>
            <td><span className="badge">{doorLabel(row.door)}</span></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Panel>
  );
}

/** Pay with a licence bought on the store, then paste its key here (spec 038). */
function LicenseSection() {
  const { t, locale, errorText } = useI18n();
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof getLicenseOffer>> | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => getLicenseOffer().then(setOffer).catch(() => setOffer(null));
  useEffect(() => { void load(); }, []);
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long' }).format(new Date(value));
  return (
    <section className="card stack">
      <h2>{t('lic.title')}</h2>
      <p className="muted small" style={{ margin: 0 }}>{t('lic.how')}</p>
      {offer?.products.length ? (
        <div className="row tight">{offer.products.map((product) => <a key={product.productId} className="btn secondary small" href={product.buyUrl!} target="_blank" rel="noreferrer">{product.label}</a>)}</div>
      ) : null}
      {offer && !offer.storeConfigured ? <p className="notice warn small" style={{ margin: 0 }}>{t('lic.storeOff')}</p> : null}
      <form className="row tight nowrap" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setMessage(null);
        try {
          const result = await redeemLicense({ data: { key } });
          setMessage({ ok: true, text: t('lic.applied', { date: date(result.paidUntil) }) }); setKey(''); await load();
        } catch (caught) { setMessage({ ok: false, text: errorText(caught) }); } finally { setBusy(false); }
      }}>
        <input value={key} onChange={(event) => setKey(event.target.value)} placeholder={t('lic.placeholder')} autoComplete="off" style={{ flex: 1, minWidth: 0, fontFamily: 'monospace' }} />
        <button type="submit" className="btn" disabled={busy || key.trim().length < 6}>{t('lic.activate')}</button>
      </form>
      {message ? <p className={message.ok ? 'notice ok small' : 'error small'} style={{ margin: 0 }}>{message.text}</p> : null}
      {offer?.redemptions.length ? (
        <div className="stack" style={{ gap: '.3rem' }}>
          <b className="small">{t('lic.history')}</b>
          {offer.redemptions.map((item) => <div key={item.maskedKey + item.redeemedAt} className="small muted"><code>{item.maskedKey}</code> · {item.planCode} · {item.months} {t('console2.months')} · {date(item.redeemedAt)} → {date(item.paidUntil)}</div>)}
        </div>
      ) : null}
    </section>
  );
}
