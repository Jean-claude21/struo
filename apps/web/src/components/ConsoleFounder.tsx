// Spec 055: the founder's console — who to call today, the plans edited with care (impact first,
// confirmation when paying companies lose something, every version kept), whether the platform
// runs, announcements and what users report.
import type { EditablePlan, FounderTodo, PlanImpact } from '@struo/core';
import { useRouter } from '@tanstack/react-router';
import { AlertTriangle, Check, History, Mail, MessageCircle, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, KpiTile, Panel, useToast } from './kit.tsx';
import { lines, Rich } from './PlanWords.tsx';
import { Badge, formatMoney } from './ui.tsx';
import {
  addCompanyNote, createAnnouncement, createPlatformKey, endAnnouncement, revokePlatformMcp, getPlanRevisions, grantFeature, handleFeedback, previewPlan, restorePlan, revokeFeature, revokePlatformKey, savePlan,
} from '@/features/settings/server.ts';
import { translate, useI18n } from '@/i18n/index.tsx';

const FEATURES = ['portal', 'ai', 'mcp', 'whatsapp'] as const;
const whatsapp = (phone: string | null) => (phone ? `https://wa.me/${phone.replace(/[^\d]/gu, '')}` : null);

// ---------------------------------------------------------------- today

export function Today({ todo, onOpen }: { todo: FounderTodo[]; onOpen: (orgId: string) => void }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const day = (value: string | null) => (value ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)) : '');
  const done = async (item: FounderTodo) => {
    try {
      if (item.kind === 'note' && item.orgId) await addCompanyNote({ data: { orgId: item.orgId, body: '', done: true } });
      await router.invalidate();
    } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  if (!todo.length) return <Panel title={t('founder.todayTitle')}><EmptyState icon={Check} title={t('founder.todayNone')} /></Panel>;
  return (
    <Panel title={t('founder.todayTitle')} sub={t('founder.todaySub', { n: todo.length })} flush>
      <ul className="claims">{todo.map((item, index) => (
        <li key={`${item.kind}${item.orgId ?? ''}${index}`} className={['expired', 'feedback', 'note'].includes(item.kind) ? 'pending' : ''}>
          <div className="row nowrap">
            <Badge tone={item.kind === 'expired' || item.kind === 'feedback' ? 'bad' : item.kind === 'lead' || item.kind === 'note' ? 'brand' : 'warn'}>{t(`founder.kinds.${item.kind}`)}</Badge>
            {item.orgId ? <button type="button" className="link-btn grow trunc" onClick={() => onOpen(item.orgId!)}><b>{item.name}</b></button> : <b className="grow trunc">{item.name}</b>}
            <span className="small muted">{item.at ? t(`founder.when.${item.kind}`, { date: day(item.at) }) : ''}</span>
          </div>
          {item.detail && item.kind !== 'expiring' && item.kind !== 'expired' ? <p className="small" style={{ margin: 0 }}>{item.detail}</p> : null}
          <div className="row" style={{ gap: '.4rem' }}>
            {item.email ? <a className="btn ghost small" href={`mailto:${item.email}`}><Mail size={14} />{item.email}</a> : null}
            {whatsapp(item.phone) ? <a className="btn ghost small" href={whatsapp(item.phone)!} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a> : null}
            {item.kind === 'note' ? <button type="button" className="btn ghost small" onClick={() => void done(item)}><Check size={14} />{t('founder.followed')}</button> : null}
          </div>
        </li>
      ))}</ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- notes on a company

export function CompanyNotes({ orgId, notes, onSaved }: { orgId: string; notes: { id: string; body: string; nextOn: string | null; adminName: string | null; createdAt: string }[]; onSaved: () => Promise<void> }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [nextOn, setNextOn] = useState('');
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  return (
    <Panel title={t('founder.notes')} sub={t('founder.notesSub')}>
      <form className="stack" style={{ gap: '.4rem' }} onSubmit={async (event) => {
        event.preventDefault();
        try { await addCompanyNote({ data: { orgId, body, nextOn: nextOn || null } }); setBody(''); setNextOn(''); await onSaved(); }
        catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
      }}>
        <textarea rows={2} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('founder.notePlaceholder')} aria-label={t('founder.notes')} />
        <div className="row"><label className="row tight small">{t('founder.remindOn')}<input type="date" value={nextOn} onChange={(event) => setNextOn(event.target.value)} style={{ width: 'auto' }} /></label>
          <button type="submit" className="btn small" disabled={!body.trim()}>{t('app.save')}</button></div>
      </form>
      {notes.map((note) => (
        <div key={note.id} className="small" style={{ borderTop: '1px solid var(--divider)', paddingTop: '.4rem', marginTop: '.4rem' }}>
          <div className="muted xsmall">{when(note.createdAt)} · {note.adminName ?? ''}{note.nextOn ? ` · ${t('founder.remind', { date: note.nextOn })}` : ''}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
        </div>
      ))}
    </Panel>
  );
}

export function Steps({ steps }: { steps: Record<string, boolean> | null | undefined }) {
  const { t } = useI18n();
  if (!steps) return null;
  const order = ['site', 'team', 'report', 'validated', 'invoice', 'client'];
  const done = order.filter((step) => steps[step]).length;
  return (
    <span className="steps-dots" title={order.map((step) => `${steps[step] ? '✓' : '·'} ${t(`founder.steps.${step as 'site'}`)}`).join('\n')} aria-label={t('founder.stepsDone', { n: done, total: order.length })}>
      {order.map((step) => <i key={step} className={steps[step] ? 'on' : ''} />)}<span className="xsmall muted">{done}/{order.length}</span>
    </span>
  );
}

export function StepsList({ steps }: { steps: Record<string, boolean> | null | undefined }) {
  const { t } = useI18n();
  if (!steps) return null;
  return (
    <Panel title={t('founder.stepsTitle')} sub={t('founder.stepsSub')}>
      <ol className="steps-list">{['site', 'team', 'report', 'validated', 'invoice', 'client'].map((step) => (
        <li key={step} className={steps[step] ? 'on' : ''}>{steps[step] ? <Check size={14} /> : <span className="dot" />}{t(`founder.steps.${step as 'site'}`)}</li>
      ))}</ol>
    </Panel>
  );
}

// ---------------------------------------------------------------- the platform runs?

type Runs = { jobs: { name: string; lastAt: string; lastOk: boolean; failures24h: number }[]; failedSends7d: { mail: number; push: number }; aiThisMonth: { turns: number; cents: number }; demo: { byRole: { name: string | null; opened: number }[]; opened: number; leaves: number; signups: number } };

export function PlatformRuns({ runs, sentryOn }: { runs: Runs; sentryOn: boolean }) {
  const { t, locale } = useI18n();
  const ago = (value: string) => {
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
    return minutes < 60 ? t('founder.minutesAgo', { n: minutes }) : t('founder.hoursAgo', { n: Math.round(minutes / 60) });
  };
  const stale = (value: string) => Date.now() - new Date(value).getTime() > 45 * 60_000;
  return (
    <div className="stack">
      <div className="grid">
        <KpiTile label={t('founder.mailFailed')} value={runs.failedSends7d.mail} tone={runs.failedSends7d.mail ? 'bad' : undefined} sub={t('founder.last7')} />
        <KpiTile label={t('founder.pushFailed')} value={runs.failedSends7d.push} tone={runs.failedSends7d.push ? 'bad' : undefined} sub={t('founder.last7')} />
        <KpiTile label={t('founder.aiMonth')} value={formatMoney(locale, runs.aiThisMonth.cents, 'USD')} sub={t('founder.aiTurns', { n: runs.aiThisMonth.turns })} />
        <KpiTile label={t('founder.demoOpened')} value={runs.demo.opened} sub={t('founder.demoFunnel', { leaves: runs.demo.leaves, signups: runs.demo.signups })} />
      </div>
      <Panel title={t('founder.jobs')} sub={t('founder.jobsSub')} flush>
        {runs.jobs.length ? (
          <div className="table-wrap"><table><tbody>{runs.jobs.map((job) => (
            <tr key={job.name}><td><b>{t(`founder.job.${job.name}` as 'founder.job.digest')}</b></td>
              <td>{job.lastOk && !stale(job.lastAt) ? <Badge tone="ok">{t('founder.ok')}</Badge> : <Badge tone="bad">{job.lastOk ? t('founder.stale') : t('founder.failed')}</Badge>}</td>
              <td className="muted small">{ago(job.lastAt)}</td>
              <td className="small">{job.failures24h ? <span className="bad-text">{t('founder.failures', { n: job.failures24h })}</span> : ''}</td></tr>
          ))}</tbody></table></div>
        ) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('founder.noJobs')}</p>}
      </Panel>
      {runs.demo.byRole.length ? (
        <Panel title={t('founder.demoTitle')} sub={t('founder.last30')}>
          <div className="row" style={{ flexWrap: 'wrap', gap: '.4rem' }}>{runs.demo.byRole.map((row) => <span key={row.name ?? '-'} className="badge">{t(`demo.roles.${(row.name ?? 'owner') as 'owner'}`)} · {row.opened}</span>)}</div>
        </Panel>
      ) : null}
      <p className="small muted">{sentryOn ? t('founder.sentryOn') : t('health.errorsOff')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- plans, edited with care

type Draft = {
  code: string; name: string; nameEn: string; tagline: string; taglineEn: string; bullets: string; bulletsEn: string;
  maxUsers: string; maxProjects: string; features: string[]; highlight: boolean; public: boolean; position: number;
};
const NEWLINE = String.fromCharCode(10);
// What the home page shows today when the console never set the words: the catalogue's default.
const catalogue = (locale: 'fr' | 'en', key: string) => { const text = translate(locale, key); return text === key ? '' : text; };
const toDraft = (plan: EditablePlan): Draft => ({
  code: plan.code, name: plan.name, nameEn: plan.nameEn ?? '',
  tagline: plan.tagline ?? catalogue('fr', `lp.offer.${plan.code}For`), taglineEn: plan.taglineEn ?? catalogue('en', `lp.offer.${plan.code}For`),
  bullets: plan.bullets ?? catalogue('fr', `lp.offer.plan_${plan.code}`).split('|').filter(Boolean).join(NEWLINE),
  bulletsEn: plan.bulletsEn ?? catalogue('en', `lp.offer.plan_${plan.code}`).split('|').filter(Boolean).join(NEWLINE),
  maxUsers: plan.maxUsers === null ? '' : String(plan.maxUsers), maxProjects: plan.maxProjects === null ? '' : String(plan.maxProjects),
  features: plan.features.filter((feature) => (FEATURES as readonly string[]).includes(feature)), highlight: plan.highlight, public: plan.public, position: plan.position,
});
const toInput = (draft: Draft) => ({
  ...draft, nameEn: draft.nameEn || null, tagline: draft.tagline || null, taglineEn: draft.taglineEn || null, bullets: draft.bullets || null, bulletsEn: draft.bulletsEn || null,
  maxUsers: draft.maxUsers.trim() ? Number(draft.maxUsers) : null, maxProjects: draft.maxProjects.trim() ? Number(draft.maxProjects) : null,
});

export function Plans({ plans }: { plans: EditablePlan[] }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const money = (minor: number, currency: string) => formatMoney(locale, minor, currency);
  if (editing) return <PlanEditor initial={editing} isNew={isNew} onClose={() => { setEditing(null); setIsNew(false); }} />;
  return (
    <div className="stack">
      <p className="notice info small">{t('plans.rules')}</p>
      <div className="plan-admin">{plans.map((plan) => (
        <article key={plan.code} className={`offer-card ${plan.highlight ? 'on' : ''}`}>
          <div className="row nowrap"><b className="grow">{plan.name}</b>{plan.public ? <Badge tone="ok">{t('plans.public')}</Badge> : <Badge>{t('plans.hidden')}</Badge>}</div>
          <code className="xsmall">{plan.code}</code>
          <span className="small">{t('plans.companies', { n: plan.companies, paying: plan.paying, trials: plan.trials })}</span>
          <span className="small muted">{plan.maxUsers ?? '∞'} {t('plans.users')} · {plan.maxProjects ?? '∞'} {t('plans.sites')}</span>
          <span className="small muted">{plan.features.filter((feature) => (FEATURES as readonly string[]).includes(feature)).map((feature) => t(`plans.features.${feature as 'ai'}`)).join(' · ') || t('plans.coreOnly')}</span>
          <span className="small">{plan.prices.length ? plan.prices.map((price) => money(price.priceMinor, price.currency)).join(' · ') : t('prices.onQuote')}</span>
          <button type="button" className="btn secondary small" onClick={() => { setEditing(toDraft(plan)); setIsNew(false); }}>{t('plans.edit')}</button>
        </article>
      ))}</div>
      <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { setIsNew(true); setEditing({ code: '', name: '', nameEn: '', tagline: '', taglineEn: '', bullets: '', bulletsEn: '', maxUsers: '', maxProjects: '', features: [], highlight: false, public: false, position: plans.length }); }}><Plus size={15} />{t('plans.new')}</button>
    </div>
  );
}

function PlanEditor({ initial, isNew, onClose }: { initial: Draft; isNew: boolean; onClose: () => void }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(initial);
  const [impact, setImpact] = useState<PlanImpact | null>(null);
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof getPlanRevisions>> | null>(null);
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const set = (patch: Partial<Draft>) => { setDraft({ ...draft, ...patch }); setImpact(null); };
  const check = async () => {
    setBusy(true);
    try { setImpact(await previewPlan({ data: toInput(draft) })); } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(false); }
  };
  const hurts = Boolean(impact && impact.paying > 0 && (impact.featuresRemoved.length || impact.overUsers.length || impact.overProjects.length));
  const save = async () => {
    setBusy(true);
    try {
      await savePlan({ data: { plan: toInput(draft), confirmCode: hurts ? confirm : undefined, note: note || null } });
      toast({ text: t('plans.saved') }); await router.invalidate(); onClose();
    } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(false); }
  };
  const words = lang === 'en'
    ? { name: draft.nameEn || draft.name, tagline: draft.taglineEn || draft.tagline, bullets: lines(draft.bulletsEn || draft.bullets) }
    : { name: draft.name, tagline: draft.tagline, bullets: lines(draft.bullets) };
  return (
    <div className="grid-main">
      <Panel title={isNew ? t('plans.new') : t('plans.editTitle', { name: initial.name })} sub={t('plans.editSub')}>
        <div className="stack">
          <div className="form-grid">
            <label className="field">{t('plans.code')}<input value={draft.code} disabled={!isNew} onChange={(event) => set({ code: event.target.value.toLowerCase() })} placeholder="pro-plus" pattern="[a-z][a-z0-9_-]{1,29}" required /><span className="xsmall faint">{t('plans.codeHint')}</span></label>
            <label className="field">{t('plans.position')}<input type="number" min={0} max={100} value={draft.position} onChange={(event) => set({ position: Number(event.target.value) })} /></label>
            <label className="field">{t('plans.name')} (FR)<input value={draft.name} maxLength={60} onChange={(event) => set({ name: event.target.value })} required /></label>
            <label className="field">{t('plans.name')} (EN)<input value={draft.nameEn} maxLength={60} onChange={(event) => set({ nameEn: event.target.value })} /></label>
            <label className="field">{t('plans.tagline')} (FR)<input value={draft.tagline} maxLength={200} onChange={(event) => set({ tagline: event.target.value })} /></label>
            <label className="field">{t('plans.tagline')} (EN)<input value={draft.taglineEn} maxLength={200} onChange={(event) => set({ taglineEn: event.target.value })} /></label>
          </div>
          <div className="form-grid">
            <label className="field">{t('plans.bullets')} (FR)<textarea rows={6} maxLength={3000} value={draft.bullets} onChange={(event) => set({ bullets: event.target.value })} /></label>
            <label className="field">{t('plans.bullets')} (EN)<textarea rows={6} maxLength={3000} value={draft.bulletsEn} onChange={(event) => set({ bulletsEn: event.target.value })} /></label>
          </div>
          <p className="xsmall faint" style={{ margin: 0 }}>{t('plans.bulletsHint')}</p>
          <div className="form-grid">
            <label className="field">{t('plans.maxUsers')}<input inputMode="numeric" value={draft.maxUsers} onChange={(event) => set({ maxUsers: event.target.value.replace(/[^\d]/gu, '') })} placeholder="∞" /></label>
            <label className="field">{t('plans.maxProjects')}<input inputMode="numeric" value={draft.maxProjects} onChange={(event) => set({ maxProjects: event.target.value.replace(/[^\d]/gu, '') })} placeholder="∞" /></label>
          </div>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: '.3rem' }}>
            <legend className="small"><b>{t('plans.featuresTitle')}</b></legend>
            <span className="xsmall faint">{t('plans.featuresHint')}</span>
            {FEATURES.map((feature) => (
              <label key={feature} className="check"><input type="checkbox" checked={draft.features.includes(feature)} onChange={(event) => set({ features: event.target.checked ? [...draft.features, feature] : draft.features.filter((item) => item !== feature) })} />
                <span><b>{t(`plans.features.${feature}`)}</b> <span className="small muted">{t(`plans.featureHint.${feature}`)}</span></span></label>
            ))}
          </fieldset>
          <label className="check"><input type="checkbox" checked={draft.highlight} onChange={(event) => set({ highlight: event.target.checked })} />{t('plans.highlight')}</label>
          <label className="check"><input type="checkbox" checked={draft.public} disabled={draft.code === 'trial'} onChange={(event) => set({ public: event.target.checked })} />{t('plans.publicLabel')}</label>
          <label className="field">{t('plans.note')}<input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder={t('plans.notePlaceholder')} /></label>

          {impact ? <ImpactView impact={impact} /> : null}
          {hurts ? (
            <label className="field">{t('plans.confirm', { code: draft.code })}<input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" /></label>
          ) : null}
          <div className="row">
            <button type="button" className="btn ghost" onClick={onClose}>{t('app.cancel')}</button>
            {!impact ? <button type="button" className="btn secondary" disabled={busy || !draft.code || !draft.name} onClick={() => void check()}>{t('plans.check')}</button>
              : <button type="button" className="btn" disabled={busy || (hurts && confirm !== draft.code)} onClick={() => void save()}>{t('plans.save')}</button>}
          </div>
        </div>
      </Panel>
      <div className="stack">
        <Panel title={t('plans.preview')} actions={<div className="seg" role="radiogroup" aria-label={t('plans.preview')}>{(['fr', 'en'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={lang === value} className={lang === value ? 'on' : ''} onClick={() => setLang(value)}>{value.toUpperCase()}</button>)}</div>}>
          <article className={`lp-plan ${draft.highlight ? 'pro' : ''}`} style={{ margin: 0 }}>
            <div className="lp-plan-top"><span>{words.tagline}</span>{draft.highlight ? <span className="badge brand">{t('lp.offer.recommended')}</span> : null}</div>
            <h3>{words.name || '…'}</h3>
            <ul>
              <li>{draft.maxUsers ? t('landing.users', { n: Number(draft.maxUsers) }) : t('landing.usersUnlimited')}</li>
              <li>{draft.maxProjects ? t('landing.projects', { n: Number(draft.maxProjects) }) : t('landing.projectsUnlimited')}</li>
              {words.bullets.map((item) => <li key={item}><Rich text={item} /></li>)}
            </ul>
          </article>
        </Panel>
        {!isNew ? (
          <Panel title={t('plans.history')} actions={revisions ? null : <button type="button" className="btn ghost small" onClick={async () => setRevisions(await getPlanRevisions({ data: { code: draft.code } }))}><History size={14} />{t('plans.showHistory')}</button>}>
            {revisions ? (revisions.length ? revisions.map((revision) => (
              <div key={revision.id} className="row nowrap small" style={{ borderTop: '1px solid var(--divider)', padding: '.4rem 0' }}>
                <span className="grow">{new Date(revision.at).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} · {revision.adminName ?? ''}{revision.note ? ` · ${revision.note}` : ''}</span>
                <button type="button" className="btn ghost small" onClick={async () => {
                  try { await restorePlan({ data: { id: revision.id, confirmCode: draft.code } }); toast({ text: t('plans.restored') }); await router.invalidate(); onClose(); }
                  catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
                }}><RotateCcw size={14} />{t('plans.restore')}</button>
              </div>
            )) : <p className="muted small" style={{ margin: 0 }}>{t('plans.noHistory')}</p>) : <p className="muted small" style={{ margin: 0 }}>{t('plans.historyHint')}</p>}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function ImpactView({ impact }: { impact: PlanImpact }) {
  const { t } = useI18n();
  if (impact.isNew) return <p className="notice info small">{t('plans.impactNew')}</p>;
  const hurt = impact.featuresRemoved.length || impact.overUsers.length || impact.overProjects.length;
  return (
    <div className={`notice ${hurt ? 'warn' : 'ok'} small stack`} style={{ gap: '.3rem' }}>
      <b className="row tight">{hurt ? <AlertTriangle size={15} /> : <Check size={15} />}{t('plans.impactTitle', { n: impact.companies, paying: impact.paying })}</b>
      {impact.featuresRemoved.length ? <span>{t('plans.impactRemoved', { list: impact.featuresRemoved.map((feature) => t(`plans.features.${feature as 'ai'}`)).join(', ') })}</span> : null}
      {impact.featuresAdded.length ? <span>{t('plans.impactAdded', { list: impact.featuresAdded.map((feature) => t(`plans.features.${feature as 'ai'}`)).join(', ') })}</span> : null}
      {impact.overUsers.length ? <span>{t('plans.impactUsers', { list: impact.overUsers.map((row) => `${row.name} (${row.count})`).join(', ') })}</span> : null}
      {impact.overProjects.length ? <span>{t('plans.impactProjects', { list: impact.overProjects.map((row) => `${row.name} (${row.count})`).join(', ') })}</span> : null}
      {impact.hidden ? <span>{t('plans.impactHidden')}</span> : null}
      {!hurt && !impact.hidden && !impact.featuresAdded.length ? <span>{t('plans.impactNone')}</span> : null}
      <span className="faint">{t('plans.impactPrices')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- announcements and feedback

type AnnouncementRow = { id: string; title: string; body: string | null; level: 'info' | 'warning'; startsAt: string; endsAt: string | null; emailedAt: string | null };

export function Announcements({ items }: { items: AnnouncementRow[] }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', body: '', level: 'info' as 'info' | 'warning', endsOn: '', email: false });
  const live = (item: AnnouncementRow) => new Date(item.startsAt) <= new Date() && (!item.endsAt || new Date(item.endsAt) > new Date());
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  return (
    <div className="grid-main">
      <Panel title={t('announce.new')} sub={t('announce.sub')}>
        <form className="stack" onSubmit={async (event) => {
          event.preventDefault();
          if (form.email && !window.confirm(t('announce.emailConfirm'))) return;
          try {
            const result = await createAnnouncement({ data: { ...form, body: form.body || null, endsOn: form.endsOn || null } });
            toast({ text: form.email ? t('announce.sentMail', { n: result.emailed }) : t('announce.published') });
            setForm({ title: '', body: '', level: 'info', endsOn: '', email: false }); await router.invalidate();
          } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
        }}>
          <label className="field">{t('announce.title')}<input value={form.title} maxLength={120} required onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="field">{t('announce.body')}<textarea rows={3} maxLength={1000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <div className="form-grid">
            <label className="field">{t('announce.level')}<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as 'info' | 'warning' })}><option value="info">{t('announce.info')}</option><option value="warning">{t('announce.warning')}</option></select></label>
            <label className="field">{t('announce.until')}<input type="date" value={form.endsOn} onChange={(event) => setForm({ ...form, endsOn: event.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={form.email} onChange={(event) => setForm({ ...form, email: event.target.checked })} />{t('announce.email')}</label>
          <button type="submit" className="btn" style={{ alignSelf: 'flex-start' }}>{t('announce.publish')}</button>
        </form>
      </Panel>
      <Panel title={t('announce.list')} flush>
        {items.length ? <ul className="claims">{items.map((item) => (
          <li key={item.id} className={live(item) ? 'pending' : ''}>
            <div className="row nowrap"><b className="grow">{item.title}</b>{live(item) ? <Badge tone="ok">{t('announce.live')}</Badge> : <Badge>{t('announce.ended')}</Badge>}</div>
            <span className="small muted">{when(item.startsAt)}{item.endsAt ? ` → ${when(item.endsAt)}` : ''}{item.emailedAt ? ` · ${t('announce.emailed')}` : ''}</span>
            {live(item) ? <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={async () => { await endAnnouncement({ data: { id: item.id } }); await router.invalidate(); }}>{t('announce.end')}</button> : null}
          </li>
        ))}</ul> : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('announce.none')}</p>}
      </Panel>
    </div>
  );
}

type FeedbackRow = { id: string; orgId: string; company: string; userName: string | null; email: string | null; kind: 'problem' | 'idea'; body: string; page: string | null; handledAt: string | null; createdAt: string };

export function Feedback({ items, onOpen }: { items: FeedbackRow[]; onOpen: (orgId: string) => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  return (
    <Panel title={t('feedback.consoleTitle')} sub={t('feedback.consoleSub')} flush>
      {items.length ? <ul className="claims">{items.map((item) => (
        <li key={item.id} className={item.handledAt ? '' : 'pending'}>
          <div className="row nowrap">
            <Badge tone={item.kind === 'problem' ? 'bad' : 'brand'}>{t(`feedback.${item.kind}`)}</Badge>
            <button type="button" className="link-btn grow trunc" onClick={() => onOpen(item.orgId)}><b>{item.company}</b> · {item.userName ?? ''}</button>
            <span className="small muted">{when(item.createdAt)}</span>
          </div>
          <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.body}</p>
          <div className="row small muted" style={{ gap: '.6rem' }}>
            {item.page ? <code>{item.page}</code> : null}
            {item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : null}
            {item.handledAt ? <span className="ok-text">{t('feedback.handled')}</span>
              : <button type="button" className="btn ghost small" onClick={async () => { await handleFeedback({ data: { id: item.id } }); await router.invalidate(); }}><Check size={14} />{t('feedback.markHandled')}</button>}
          </div>
        </li>
      ))}</ul> : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('feedback.none')}</p>}
    </Panel>
  );
}


// ---------------------------------------------------------------- spec 056: the console through MCP

type KeyRow = { id: string; name: string; masked: string; readOnly: boolean; createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

type Connection = { userId: string; clientId: string; clientName: string; email: string; readOnly: boolean; createdAt: string };

export function McpAccess({ keys, url, connections }: { keys: KeyRow[]; url: string; connections: Connection[] }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [shown, setShown] = useState<string | null>(null);
  const when = (value: string | null) => (value ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—');
  return (
    <div className="stack">
    <Panel title={t('pmcp.oauthTitle')} sub={t('pmcp.oauthSub')}>
      <div className="stack">
        <div><b className="small">{t('pmcp.url')}</b><div className="secret" style={{ userSelect: 'all' }}>{url}</div></div>
        <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '.25rem' }}>
          <li>{t('pmcp.step1')}</li><li>{t('pmcp.step2')}</li><li>{t('pmcp.step3')}</li>
        </ol>
        {connections.length ? (
          <ul className="claims">{connections.map((item) => (
            <li key={item.userId + item.clientId}>
              <div className="row nowrap"><b className="grow">{item.clientName}</b><Badge tone={item.readOnly ? 'ok' : 'warn'}>{item.readOnly ? t('pmcp.ro') : t('pmcp.rw')}</Badge></div>
              <span className="small muted">{item.email} · {when(item.createdAt)}</span>
              <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={async () => { if (!window.confirm(t('pmcp.revokeConfirm'))) return; await revokePlatformMcp({ data: { userId: item.userId, clientId: item.clientId } }); await router.invalidate(); }}>{t('pmcp.revoke')}</button>
            </li>
          ))}</ul>
        ) : <p className="muted small" style={{ margin: 0 }}>{t('pmcp.noConnection')}</p>}
      </div>
    </Panel>
    <div className="grid-main">
      <Panel title={t('pmcp.title')} sub={t('pmcp.sub')}>
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>{t('pmcp.how')}</p>
          {shown ? (
            <div className="notice ok stack" style={{ gap: '.3rem' }}>
              <b>{t('pmcp.copyNow')}</b><code className="secret" style={{ userSelect: 'all' }}>{shown}</code>
              <button type="button" className="btn small secondary" style={{ justifySelf: 'start' }} onClick={() => { void navigator.clipboard?.writeText(shown); toast({ text: t('pmcp.copied') }); }}>{t('pmcp.copy')}</button>
            </div>
          ) : null}
          <form className="stack" style={{ gap: '.5rem' }} onSubmit={async (event) => {
            event.preventDefault();
            try { const { key } = await createPlatformKey({ data: { name, readOnly } }); setShown(key); setName(''); await router.invalidate(); }
            catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
          }}>
            <label className="field">{t('pmcp.name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder={t('pmcp.namePlaceholder')} /></label>
            <label className="check"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />{t('pmcp.readOnly')}</label>
            <span className="xsmall faint">{readOnly ? t('pmcp.readOnlyHint') : t('pmcp.fullHint')}</span>
            <button type="submit" className="btn small" style={{ alignSelf: 'flex-start' }}>{t('pmcp.create')}</button>
          </form>
        </div>
      </Panel>
      <Panel title={t('pmcp.keys')} flush>
        {keys.length ? <ul className="claims">{keys.map((key) => (
          <li key={key.id} className={key.revokedAt ? '' : 'pending'}>
            <div className="row nowrap"><b className="grow">{key.name}</b>{key.revokedAt ? <Badge>{t('pmcp.revoked')}</Badge> : <Badge tone={key.readOnly ? 'ok' : 'warn'}>{key.readOnly ? t('pmcp.ro') : t('pmcp.rw')}</Badge>}</div>
            <span className="small muted"><code>{key.masked}</code> · {key.createdBy ?? ''} · {t('pmcp.lastUsed', { date: when(key.lastUsedAt) })}</span>
            {!key.revokedAt ? <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={async () => { if (!window.confirm(t('pmcp.revokeConfirm'))) return; await revokePlatformKey({ data: { id: key.id } }); await router.invalidate(); }}>{t('pmcp.revoke')}</button> : null}
          </li>
        ))}</ul> : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('pmcp.none')}</p>}
      </Panel>
    </div>
    </div>
  );
}

type Grant = { orgId: string; company: string; feature: string; until: string | null; reason: string | null; active: boolean };

export function FeatureGrants({ orgId, grants, onSaved }: { orgId: string; grants: Grant[]; onSaved: () => Promise<void> }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [feature, setFeature] = useState<string>('portal');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Panel title={t('grants.title')} sub={t('grants.sub')}>
      {grants.map((grant) => (
        <div key={grant.feature} className="row nowrap small" style={{ borderBottom: '1px solid var(--divider)', padding: '.35rem 0' }}>
          <b className="grow">{t(`plans.features.${grant.feature as 'ai'}`)}</b>
          <span className={grant.active ? 'ok-text' : 'muted'}>{grant.until ? t('grants.until', { date: grant.until }) : t('grants.noEnd')}</span>
          <button type="button" className="btn ghost small" onClick={async () => { try { await revokeFeature({ data: { orgId, feature: grant.feature } }); await onSaved(); } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); } }}>{t('grants.revoke')}</button>
        </div>
      ))}
      <form className="row" style={{ flexWrap: 'wrap', gap: '.5rem', marginTop: '.5rem' }} onSubmit={async (event) => {
        event.preventDefault();
        try { await grantFeature({ data: { orgId, feature, until: until || null, reason: reason || null } }); setReason(''); setUntil(''); toast({ text: t('grants.done') }); await onSaved(); }
        catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
      }}>
        <select value={feature} onChange={(event) => setFeature(event.target.value)} style={{ width: 'auto' }} aria-label={t('grants.feature')}>{FEATURES.map((item) => <option key={item} value={item}>{t(`plans.features.${item}`)}</option>)}</select>
        <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} style={{ width: 'auto' }} aria-label={t('grants.untilLabel')} />
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder={t('grants.reason')} style={{ flex: 1, minWidth: 140 }} />
        <button type="submit" className="btn small">{t('grants.give')}</button>
      </form>
    </Panel>
  );
}
