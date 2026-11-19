import { can, ROLES } from '@struo/core/permissions';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, DateText, ErrorText, Field, formData, formatMoney, Tabs, useAction } from '@/components/ui.tsx';
import {
  addConfigurationItem, createApiKey, getSettingsPage, inviteMember, removeConfigurationItem, removeMember, revokeApiKey,
  revokeInvitation, setMemberRole, setPaymentProvider, updateSettings,
} from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/settings')({
  loader: () => getSettingsPage(),
  component: Settings,
});

type Tab = 'company' | 'configuration' | 'members' | 'payments' | 'integrations' | 'subscription';
type Data = Awaited<ReturnType<typeof getSettingsPage>>;

function Settings() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('company');
  const tabs: Tab[] = ['company', 'configuration', 'members', 'payments', 'integrations', 'subscription'];
  return (
    <div className="stack">
      <h1>{t('settings.title')}</h1>
      <Tabs value={tab} onChange={setTab} items={tabs.map((value) => ({ value, label: t(`settings.${value}`) }))} />
      {tab === 'company' ? <CompanyTab data={data} /> : null}
      {tab === 'configuration' ? <ConfigurationTab data={data} /> : null}
      {tab === 'members' ? <MembersTab data={data} /> : null}
      {tab === 'payments' ? <PaymentsTab data={data} /> : null}
      {tab === 'integrations' ? <IntegrationsTab data={data} /> : null}
      {tab === 'subscription' ? <SubscriptionTab data={data} /> : null}
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
            <input name="brandColor" type="color" defaultValue={s.brandColor ?? '#e8590c'} />
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
              <input name="name" required maxLength={80} placeholder={t('app.name')} />
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
  const { plan, users, projects, trialEndsAt } = data.subscription;
  return (
    <section className="card stack">
      <h2>
        {t('settings.plan')} : <span className="accent">{plan.name}</span>
      </h2>
      <p>{plan.priceMinor > 0 ? `${formatMoney(locale, plan.priceMinor, plan.currencyCode)} ${t('landing.perMonth')}` : null}</p>
      <p>{t('settings.usage', { users, projects })}</p>
      <p className="muted">
        {plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')} ·{' '}
        {plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}
      </p>
      {plan.code === 'trial' ? <p>{t('dashboard.trialEnds', { date: new Intl.DateTimeFormat(locale).format(new Date(trialEndsAt)) })}</p> : null}
      <p className="notice info">{t('settings.changePlan')}</p>
    </section>
  );
}
