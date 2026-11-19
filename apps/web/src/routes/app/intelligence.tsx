// « Intelligence & MCP » (spec 034): who pays the AI and how to connect, how to use Struo from
// ChatGPT or Claude, every capability documented (generated from the registry), and the journal of
// what the assistant and the copilots did.
import { can } from '@struo/core/permissions';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Bot, Check, Copy, KeyRound, LogOut, MessageSquare, Sparkles, Terminal } from 'lucide-react';
import { useAssistant } from '@/components/Intelligence.tsx';
import { PageHeader, Panel, useToast } from '@/components/kit.tsx';
import { Tabs } from '@/components/ui.tsx';
import { getIntelligencePage, removeMyConnection, saveMyApiKey, setAiPolicy } from '@/features/intelligence/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/intelligence')({
  validateSearch: (search: Record<string, unknown>): { plan?: string; tab?: string } => ({
    ...(typeof search.plan === 'string' ? { plan: search.plan } : {}),
    ...(typeof search.tab === 'string' ? { tab: search.tab } : {}),
  }),
  loader: () => getIntelligencePage(),
  component: IntelligencePage,
});

type Data = Awaited<ReturnType<typeof getIntelligencePage>>;
type Tab = 'connection' | 'copilots' | 'capabilities' | 'journal';

function IntelligencePage() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const { open } = useAssistant();
  const [tab, setTab] = useState<Tab>((search.tab as Tab | undefined) ?? (search.plan ? 'connection' : 'connection'));
  return (
    <div className="stack loose">
      <PageHeader title={t('ai.navLabel')} text={t('ai.page.subtitle')}>
        <button type="button" className="btn" onClick={() => open()}><Sparkles size={16} />{t('ai.open')}</button>
      </PageHeader>
      {search.plan === 'connected' ? <p className="notice ok">{t('ai.page.planConnected')}</p>
        : search.plan === 'unavailable' ? <p className="notice warn">{t('ai.page.planUnavailable')}</p>
        : search.plan ? <p className="notice warn">{t('ai.page.planRefused')}</p> : null}
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'connection', label: t('ai.page.tabConnection') },
        { value: 'copilots', label: t('ai.page.tabCopilots') },
        { value: 'capabilities', label: `${t('ai.page.tabCapabilities')} · ${data.catalog.length}` },
        { value: 'journal', label: t('ai.page.tabJournal') },
      ]} />
      {tab === 'connection' ? <Connection data={data} /> : null}
      {tab === 'copilots' ? <Copilots data={data} /> : null}
      {tab === 'capabilities' ? <Capabilities data={data} /> : null}
      {tab === 'journal' ? <Journal data={data} /> : null}
    </div>
  );
}

const usd = (cents: number, locale: string) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency: 'USD' }).format(cents / 100);

function Connection({ data }: { data: Data }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState(data.policy.policy);
  const [budget, setBudget] = useState(data.policy.budgetCents === null ? '' : String(data.policy.budgetCents / 100));
  const personalAllowed = data.policy.policy !== 'company';
  const using = data.mine && personalAllowed ? data.mine.kind : 'company';
  const disconnect = async () => { await removeMyConnection(); await router.invalidate(); };
  return (
    <div className="stack">
      <div className="grid">
        <Panel title={<span className="row tight"><Bot size={17} />{t('ai.page.companyKey')}</span>} actions={using === 'company' ? <span className="badge ok">{t('ai.page.inUse')}</span> : null}>
          <p className="small muted" style={{ marginTop: 0 }}>{t('ai.page.companyKeyText')}</p>
          {data.companyConfigured ? <p className="small" style={{ margin: 0 }}>{t('ai.page.model', { model: data.companyModel })}</p> : <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{t('ai.page.companyNotConfigured')}</p>}
          <p className="small" style={{ marginBottom: 0 }}>
            <b>{t('ai.page.usage')}</b> · {t('ai.page.usageCompany', { turns: data.usage.companyTurns, amount: usd(data.usage.companyCents, locale) })}
            {data.policy.budgetCents !== null ? <><br />{t('ai.page.budgetLeft', { spent: usd(data.usage.companyCents, locale), budget: usd(data.policy.budgetCents, locale) })}</> : null}
            <br />{t('ai.page.usageMine', { turns: data.usage.mineTurns, personal: data.usage.minePersonalTurns })}
          </p>
        </Panel>
        <Panel title={<span className="row tight"><KeyRound size={17} />{t('ai.page.myKey')}</span>} actions={using === 'api_key' ? <span className="badge ok">{t('ai.page.inUse')}</span> : null}>
          <p className="small muted" style={{ marginTop: 0 }}>{t('ai.page.myKeyText')}</p>
          {data.mine?.kind === 'api_key' ? (
            <div className="row tight"><span className="badge">{t('ai.page.connected', { hint: data.mine.hint })}</span><span className="sp" />
              <button type="button" className="btn ghost small" onClick={() => void disconnect()}><LogOut size={14} />{t('ai.page.disconnect')}</button></div>
          ) : personalAllowed ? (
            <form className="row tight nowrap" onSubmit={async (event) => {
              event.preventDefault(); setBusy(true); setError(null);
              try { await saveMyApiKey({ data: { key } }); setKey(''); toast({ text: t('ai.page.saved') }); await router.invalidate(); }
              catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
            }}>
              <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={t('ai.page.keyPlaceholder')} autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
              <button type="submit" className="btn small" disabled={busy || key.trim().length < 20}>{t('ai.page.saveKey')}</button>
            </form>
          ) : <p className="small muted">{t('errors.ai_personal_off')}</p>}
          {error ? <p className="error small">{error}</p> : null}
        </Panel>
        <Panel title={<span className="row tight"><MessageSquare size={17} />{t('ai.page.chatgpt')}</span>} actions={using === 'plan' ? <span className="badge ok">{t('ai.page.inUse')}</span> : null}>
          <p className="small muted" style={{ marginTop: 0 }}>{t('ai.page.chatgptText')}</p>
          {data.mine?.kind === 'plan' ? (
            <div className="row tight"><span className="badge">{t('ai.page.connected', { hint: data.mine.hint })}</span><span className="sp" />
              <button type="button" className="btn ghost small" onClick={() => void disconnect()}><LogOut size={14} />{t('ai.page.disconnect')}</button></div>
          ) : data.planAvailable && personalAllowed ? (
            <a className="btn small" href="/api/ai/chatgpt/start"><MessageSquare size={14} />{t('ai.page.chatgptButton')}</a>
          ) : <p className="small notice info" style={{ margin: 0 }}>{t('ai.page.chatgptWaiting')}</p>}
        </Panel>
        <Panel title={<span className="row tight"><Sparkles size={17} />{t('ai.page.claude')}</span>} actions={<span className="badge">{t('ai.page.soon')}</span>}>
          <p className="small muted" style={{ margin: 0 }}>{t('ai.page.claudeText')}</p>
        </Panel>
      </div>
      {can(data.role, 'org.manage') ? (
        <Panel title={t('ai.page.policy')} sub={t('ai.page.policyHelp')}>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const cents = budget.trim() === '' ? null : Math.round(Number(budget.replace(',', '.')) * 100);
            try { await setAiPolicy({ data: { policy, budgetCents: Number.isFinite(cents) ? cents : null } }); toast({ text: t('ai.page.saved') }); await router.invalidate(); }
            catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
          }}>
            {(['company', 'allowed', 'required'] as const).map((value) => (
              <label key={value} className="row tight small"><input type="radio" name="policy" checked={policy === value} onChange={() => setPolicy(value)} />{t(`ai.page.policies.${value}`)}</label>
            ))}
            <label className="field" style={{ maxWidth: 360 }}>{t('ai.page.budget')}<input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" /></label>
            <div><button type="submit" className="btn small">{t('ai.page.savePolicy')}</button></div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}

function CopyLine({ value }: { value: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <div className="row tight nowrap">
      <code className="secret grow trunc">{value}</code>
      <button type="button" className="btn ghost small" onClick={() => void navigator.clipboard.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); })}>
        {done ? <Check size={14} /> : <Copy size={14} />}{done ? t('ai.page.copied') : t('ai.page.copy')}
      </button>
    </div>
  );
}

function Copilots({ data }: { data: Data }) {
  const { t } = useI18n();
  const steps = (keys: MessageKey[]) => <ol className="small" style={{ margin: '.25rem 0 0', paddingLeft: '1.2rem', lineHeight: 1.7 }}>{keys.map((key) => <li key={key}>{t(key)}</li>)}</ol>;
  return (
    <div className="stack">
      <Panel title={t('ai.page.mcpTitle')} sub={t('ai.page.mcpText')}>
        <div className="stack" style={{ gap: '.4rem' }}><b className="small">{t('ai.page.mcpUrl')}</b><CopyLine value={data.mcpUrl} /></div>
      </Panel>
      <div className="grid">
        <Panel title={t('ai.page.chatgptSteps')}>{steps(['ai.page.chatgptStep1', 'ai.page.chatgptStep2', 'ai.page.chatgptStep3', 'ai.page.chatgptStep4'])}</Panel>
        <Panel title={t('ai.page.claudeSteps')}>{steps(['ai.page.claudeStep1', 'ai.page.claudeStep2', 'ai.page.claudeStep3'])}</Panel>
        <Panel title={<span className="row tight"><Terminal size={16} />{t('ai.page.codeSteps')}</span>}>
          <p className="small" style={{ marginTop: 0 }}>{t('ai.page.codeStep1')}</p>
          <CopyLine value={`claude mcp add --transport http struo ${data.mcpUrl} --header "Authorization: Bearer <clé>"`} />
          {can(data.role, 'apikeys.manage') ? <a className="btn secondary small" style={{ marginTop: '.6rem' }} href="/app/settings?tab=mcp"><KeyRound size={14} />{t('ai.page.createKey')}</a> : null}
        </Panel>
      </div>
      <Panel title={t('ai.page.copilots')}>
        {data.copilots.length ? data.copilots.map((copilot: { clientId: string; name?: string | null; connectedAt?: string }) => (
          <div key={copilot.clientId} className="alert-row"><Bot size={16} /><span className="grow">{copilot.name ?? copilot.clientId}</span></div>
        )) : <p className="muted small" style={{ margin: 0 }}>{t('ai.page.noCopilots')}</p>}
      </Panel>
    </div>
  );
}

function Capabilities({ data }: { data: Data }) {
  const { t } = useI18n();
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const groups = [...new Set(data.catalog.map((item) => item.group))];
  const shown = useMemo(() => data.catalog.filter((item) => (group === 'all' || item.group === group)
    && (!q.trim() || `${item.name} ${t(`caps.${item.name}` as MessageKey)} ${t(`capsd.${item.name}` as MessageKey)}`.toLowerCase().includes(q.trim().toLowerCase()))), [data.catalog, group, q, t]);
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>{t('ai.page.capabilitiesCount', { n: data.catalog.length })}. {t('ai.page.levelsHelp')}</p>
      <div className="row">
        <div className="search-in" style={{ width: 240 }}><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ai.page.search')} aria-label={t('ai.page.search')} /></div>
        <div className="chips">
          <button type="button" className={`chip ${group === 'all' ? 'selected' : ''}`} onClick={() => setGroup('all')}>{t('ai.page.all')}</button>
          {groups.map((item) => <button key={item} type="button" className={`chip ${group === item ? 'selected' : ''}`} onClick={() => setGroup(item)}>{t(`capg.${item}` as MessageKey)}</button>)}
        </div>
      </div>
      <div className="cap-grid">
        {shown.map((item) => (
          <article key={item.name} className="cap-card">
            <div className="row tight nowrap">
              <b className="grow">{t(`caps.${item.name}` as MessageKey)}</b>
              <span className={`lvl l${item.autonomy}`} title={t(`ai.page.levels.${item.autonomy}` as MessageKey)}>{item.autonomy}</span>
            </div>
            <code className="xsmall faint">{item.name}</code>
            <p className="small" style={{ margin: '.35rem 0' }}>{t(`capsd.${item.name}` as MessageKey)}</p>
            <div className="xsmall muted"><b>{t(`ai.page.levels.${item.autonomy}` as MessageKey)}</b> · {t('ai.page.who')} : {item.roles.map((role) => t(`roles.${role}` as MessageKey)).join(', ')}</div>
            <details className="xsmall" style={{ marginTop: '.35rem' }}>
              <summary>{t('ai.page.inputs')} · {item.inputs.length}</summary>
              {item.inputs.length ? (
                <ul style={{ margin: '.3rem 0 0', paddingLeft: '1rem' }}>
                  {item.inputs.map((input) => <li key={input.name}><code>{input.name}</code> <span className="faint">{input.type}{input.required ? ` · ${t('ai.page.required')}` : ''}</span>{input.description ? ` — ${input.description}` : ''}</li>)}
                </ul>
              ) : <p className="faint" style={{ margin: '.3rem 0 0' }}>{t('ai.page.noInputs')}</p>}
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function Journal({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const when = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  return (
    <Panel title={t('ai.page.journal')}>
      {data.journal.length ? (
        <div className="table-wrap"><table>
          <tbody>{data.journal.map((row) => (
            <tr key={row.id}>
              <td className="nowrap muted small">{when(row.at)}</td>
              <td><span className={`badge ${row.door === 'ai' ? 'brand' : ''}`}>{t(`ai.page.door.${row.door as 'ai'}`)}</span></td>
              <td className="small">{row.actorName ?? '—'}</td>
              <td><code className="small">{row.command}</code></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>{t('ai.page.noJournal')}</p>}
    </Panel>
  );
}
