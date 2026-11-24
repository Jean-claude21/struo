// The field app (spec 025): rendered in the browser only (it starts without network), installable
// (PWA). Everything written goes to the outbox first (IndexedDB) and leaves when the network is back;
// every item carries its own id, so sending twice changes nothing.
import { createFileRoute } from '@tanstack/react-router';
import { LicenceBar } from '@/components/Platform.tsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Check, ChevronRight, ClipboardCheck, CloudRain, CloudSun, FileSignature, FileText, Hammer, HardHat, Home, LogOut, Map as MapIcon,
  Mic, PackageCheck, RefreshCw, ScanLine, Square, Sun, TriangleAlert, Truck, UserRound, Users, Wind, Wrench, CloudOff, CheckCircle2, X, MessageCircle, Send,
} from 'lucide-react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { PushToggle } from '@/components/PushToggle.tsx';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad.tsx';
import { authClient } from '@/features/auth/client.ts';
import { AssistantButton, IntelligenceProvider } from '@/components/Intelligence.tsx';
import {
  compressPhoto, currentPosition, enqueue, fetchSnapshot, outbox, persist, readSnapshot, syncOutbox, type FieldProject, type FieldSnapshot,
  type OutboxItem, type OutboxPhoto,
  clearSnapshot,
} from '@/features/field/store.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { updateTask } from '@/features/office/server.ts';

export const Route = createFileRoute('/field')({
  ssr: false,
  head: () => ({ links: [{ rel: 'manifest', href: '/manifest.webmanifest' }] }),
  component: FieldApp,
});

type Tab = 'home' | 'sites' | 'plans' | 'office' | 'me';
type Flow = null | 'report' | 'incident' | 'checklist' | 'delivery' | 'pv' | { done: 'report' | 'checklist' | 'delivery' | 'pv' | 'incident' };
const INCIDENT_KINDS = [['material_delay', Truck], ['defect', Hammer], ['weather', CloudRain], ['accident', TriangleAlert], ['equipment', Wrench], ['other', ClipboardCheck]] as const;
const PRIORITIES = ['info', 'important', 'critical'] as const;
const now = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

function FieldApp() {
  const { t } = useI18n();
  const online = useOnline();
  const [snapshot, setSnapshot] = useState<FieldSnapshot | null>(null);
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [flow, setFlow] = useState<Flow>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [checklistTemplate, setChecklistTemplate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setQueue(await outbox());
    if (navigator.onLine) {
      try {
        // First who is signed in (and their sites), then what they wrote offline, then fresh figures.
        let fresh = await fetchSnapshot();
        const { sent } = await syncOutbox(fresh?.user.id);
        if (sent) fresh = (await fetchSnapshot()) ?? fresh;
        if (fresh) setSnapshot(fresh);
        setAuthError(null);
      } catch (error) {
        setAuthError((error as Error).message);
        if ((error as Error).message === 'not_signed_in' || (error as Error).message === 'no_company') setSnapshot(null);
      }
      setQueue(await outbox());
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await persist();
      const saved = (await readSnapshot()) ?? null;
      setSnapshot(saved);
      try { setSiteId(localStorage.getItem('struo.field.site')); } catch { /* not remembered */ }
      setQueue(await outbox());
      setLoaded(true);
      await refresh();
    })();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, [refresh]);
  useEffect(() => { if (online) void refresh(); }, [online, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (navigator.onLine) void refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const sites = snapshot?.projects ?? [];
  const site = sites.find((candidate) => candidate.id === siteId) ?? sites.find((candidate) => candidate.status === 'active') ?? sites[0] ?? null;
  const chooseSite = (id: string) => { setSiteId(id); try { localStorage.setItem('struo.field.site', id); } catch { /* ignore */ } };
  const saved = async (kind: 'report' | 'checklist' | 'delivery' | 'pv' | 'incident') => {
    setQueue(await outbox());
    setFlow({ done: kind });
    if (navigator.onLine) await refresh();
  };

  if (!loaded) return <div className="field-app"><p className="field-body" style={{ paddingTop: '2rem' }}>{t('ui.loading')}</p></div>;
  if (authError === 'not_signed_in' && !snapshot) {
    return (
      <div className="field-app"><div className="field-body" style={{ paddingTop: '2rem' }}>
        <HardHat size={48} style={{ color: 'var(--brand)' }} />
        <p>{t('errors.not_signed_in')}</p>
        <a className="btn block" href="/login?next=/field">{t('auth.signIn')}</a>
      </div></div>
    );
  }

  const pending = queue.length;
  const pill = online
    ? <span className={`sync-pill ${pending ? 'wait' : 'ok'}`}>{pending ? <RefreshCw size={13} /> : <Check size={13} />}{pending ? t('fieldApp.pending', { n: pending }) : t('fieldApp.allSent')}</span>
    : <span className="sync-pill wait"><CloudOff size={13} />{t('fieldApp.offline', { n: pending })}</span>;

  if (flow && site && snapshot) {
    const close = () => setFlow(null);
    if (typeof flow === 'object') return <Done kind={flow.done} online={online && !pending} onHome={() => { setFlow(null); setTab('home'); }} onAgain={() => setFlow(flow.done === 'pv' ? 'pv' : flow.done === 'incident' ? 'incident' : flow.done === 'delivery' ? 'delivery' : 'report')} />;
    if (flow === 'report') return <ReportFlow snapshot={snapshot} initialSite={site} onCancel={close} onSaved={() => saved('report')} />;
    if (flow === 'incident') return <IncidentFlow site={site} onCancel={close} onSaved={() => saved('incident')} />;
    if (flow === 'checklist') return <ChecklistFlow site={site} template={snapshot.templates?.find((item) => item.id === checklistTemplate) ?? snapshot.templates?.[0] ?? null} onCancel={close} onSaved={() => saved('checklist')} />;
    if (flow === 'delivery') return <DeliveryFlow site={site} scanAvailable={Boolean(snapshot.scanAvailable)} onCancel={close} onSaved={() => saved('delivery')} />;
    if (flow === 'pv') return <PvFlow site={site} onCancel={close} onSaved={() => saved('pv')} />;
  }

  return (
    <IntelligenceProvider>
    <div className="field-app">
      <header className="field-header">
        <div>
          <div className="muted small">{snapshot?.company.name ?? 'Struo'}</div>
          <strong style={{ fontSize: '1.35rem' }}>{t('fieldApp.hello', { name: snapshot?.user.name.split(' ')[0] ?? '' })}</strong>
        </div>
        <span className="row tight">{online && snapshot ? <AssistantButton /> : null}{pill}</span>
      </header>
      <div className="field-body" style={{ paddingBottom: '9.5rem' }}>
        {!snapshot ? <p className="notice">{t('fieldApp.neverSynced')}</p> : null}
        {snapshot ? <LicenceBar access={snapshot.access} canRenew={snapshot.user.role === 'owner' || snapshot.user.role === 'admin'} /> : null}
        {tab === 'home' && snapshot ? (
          <HomeTab snapshot={snapshot} site={site} onFlow={(next, template) => { if (template) setChecklistTemplate(template); setFlow(next); }} onSite={chooseSite} />
        ) : null}
        {tab === 'sites' ? (
          <div className="stack">
            <h2 style={{ margin: 0 }}>{t('fieldApp.mySites')}</h2>
            {sites.map((candidate) => (
              <button key={candidate.id} type="button" className={`site-card ${candidate.id === site?.id ? 'selected' : ''}`} onClick={() => { chooseSite(candidate.id); setTab('home'); }}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong className="trunc" style={{ display: 'block' }}>{candidate.code} · {candidate.name}</strong>
                  <span className="muted small">{candidate.location ?? ''}</span>
                  <span className="progress" style={{ marginTop: '.4rem', display: 'block' }}><span style={{ width: `${candidate.progressPct}%` }} /></span>
                </span>
                <strong>{candidate.progressPct} %</strong><ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : null}
        {tab === 'plans' && site ? (
          <div className="stack">
            <h2 style={{ margin: 0 }}>{t('field2.tabPlans')} · {site.code}</h2>
            {site.plans?.length ? site.plans.map((plan) => (
              <a key={plan.id} className="site-card" href={`/api/files/document/${plan.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <span className="ftype" style={{ ['--c' as string]: '#8e2a22' }}><FileText size={18} /></span>
                <span className="grow">{plan.title}</span><ChevronRight size={18} />
              </a>
            )) : <p className="muted">{t('field2.noPlans')}</p>}
            <p className="faint small">{t('field2.planOffline')}</p>
          </div>
        ) : null}
        {tab === 'office' && site ? (
          <OfficeTab site={site} queue={queue} canRequest={Boolean(snapshot?.user.canReport)} onQueued={async () => { setQueue(await outbox()); if (navigator.onLine) await refresh(); }} />
        ) : null}
        {tab === 'me' ? (
          <div className="stack">
            <h2 style={{ margin: 0 }}>{snapshot?.user.name}</h2>
            <div className="row"><LanguageSwitch /></div>
            <h3 style={{ margin: '.5rem 0 0' }}>{t('teamPush.title')}</h3>
            <PushToggle />
            <h3 style={{ margin: '.5rem 0 0' }}>{t('field2.outbox')}</h3>
            {queue.length ? queue.map((item) => (
              <div key={item.id} className="card small">
                <b>{t(`field2.kinds.${item.type}` as MessageKey)}</b> · {sites.find((candidate) => candidate.id === item.payload.projectId)?.code ?? ''}
                {item.lastError ? <div className="error">{t('fieldApp.failed')} ({item.lastError})</div> : <div className="muted">{t('field2.waiting')}</div>}
              </div>
            )) : <p className="muted">{t('field2.noOutbox')}</p>}
            <button type="button" className="btn secondary" onClick={() => void refresh()}><RefreshCw size={16} />{t('fieldApp.syncNow')}</button>
            <a href="/app" className="btn ghost">{t('field2.office')}</a>
            <a href="/app/account" className="btn ghost">{t('account.title')}</a>
            <button type="button" className="btn ghost" onClick={async () => { await clearSnapshot(); await authClient.signOut(); window.location.href = '/login?next=/field'; }}><LogOut size={16} />{t('field2.signOut')}</button>
          </div>
        ) : null}
      </div>
      {tab === 'home' && snapshot?.user.canReport && site ? (
        <div className="field-footer" style={{ bottom: 62 }}>
          <div className="pair">
            <button type="button" className="btn secondary" onClick={() => setFlow('incident')}><TriangleAlert size={18} />{t('field2.problem')}</button>
            <button type="button" className="btn" onClick={() => setFlow('report')}><Camera size={18} />{t('field2.newReport')}</button>
          </div>
        </div>
      ) : null}
      <nav className="field-tabs" aria-label="Struo">
        {([['home', Home, 'field2.tabHome'], ['sites', HardHat, 'field2.tabSites'], ['plans', MapIcon, 'field2.tabPlans'], ['office', MessageCircle, 'fieldOffice.tab'], ['me', UserRound, 'field2.tabMe']] as const).map(([value, Icon, label]) => (
          <button key={value} type="button" className={tab === value ? 'on' : ''} onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined}>
            <Icon size={22} />{t(label)}
          </button>
        ))}
      </nav>
    </div>
    </IntelligenceProvider>
  );
}

// ---------------------------------------------------------------- T2: home

function weatherLine(t: (key: MessageKey, params?: Record<string, string | number>) => string, site: FieldProject, limit: number) {
  const day = site.weather?.[0];
  if (!day) return null;
  const wet = day.rain >= limit;
  return { wet, text: wet ? t('field2.weatherRain', { max: day.max, rain: day.rain }) : t('field2.weatherOk', { max: day.max }) };
}

function HomeTab({ snapshot, site, onFlow, onSite }: {
  snapshot: FieldSnapshot; site: FieldProject | null; onFlow: (flow: Flow, template?: string) => void; onSite: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!site) return <p className="muted">{t('app.empty')}</p>;
  const weather = weatherLine(t, site, snapshot.rainLimit ?? 60);
  const done = new Set((site.checklistsToday ?? []).filter((run) => run.completed).map((run) => run.name));
  const toFix = (snapshot.toFix ?? []).filter((report) => report.projectCode === site.code);
  const others = snapshot.projects.filter((candidate) => candidate.id !== site.id);
  return (
    <div className="stack loose">
      <PushToggle compact />
      {weather ? (
        <span className={`badge ${weather.wet ? 'warn' : 'ok'}`} style={{ alignSelf: 'flex-start', fontSize: '.88rem', padding: '.3rem .7rem' }}>
          {weather.wet ? <CloudRain size={15} /> : <Sun size={15} />}{weather.text}
        </span>
      ) : null}
      <section className="card stack" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, var(--brand-soft), var(--surface-2))', padding: '1rem' }}>
          <div className="muted small">{t('field2.today')}</div>
          <b style={{ fontSize: '1.15rem' }}>{site.code} · {site.name}</b>
          <div className="progress" style={{ marginTop: '.5rem' }}><span style={{ width: `${site.progressPct}%` }} /></div>
        </div>
        <div className="stack" style={{ padding: '0 1rem 1rem', gap: '.5rem' }}>
          <b>{t('field2.myActions')}</b>
          {(snapshot.templates ?? []).filter((template) => appliesToday(template, site)).map((template) => (
            <button key={template.id} type="button" className={`check-row ${done.has(template.name) ? 'on' : ''}`} onClick={() => onFlow('checklist', template.id)} disabled={done.has(template.name)}>
              <span className="box">{done.has(template.name) ? <Check size={16} /> : null}</span>
              <span className="grow">{done.has(template.name) ? t('field2.checklistDone', { name: template.name }) : t('field2.checklistTodo', { name: template.name })}</span>
              {!done.has(template.name) ? <span className="faint small">0/{template.items.length}</span> : null}
            </button>
          ))}
          {toFix.map((report) => (
            <div key={report.id} className="notice small"><TriangleAlert size={16} />{t('field2.toFix', { note: report.reviewNote ?? '' })}</div>
          ))}
          {(snapshot.tasks ?? []).filter((task) => task.projectId === site.id).map((task) => <FieldTask key={task.id} task={task} />)}
          {site.openIncidents ? <div className="notice bad small"><TriangleAlert size={16} />{t('field2.openIncidents', { n: site.openIncidents })}</div> : null}
          {(snapshot.templates ?? []).filter((template) => template.mode === 'on_demand').length ? (
            <div className="chips">
              {(snapshot.templates ?? []).filter((template) => template.mode === 'on_demand').map((template) => (
                <button key={template.id} type="button" className="chip" onClick={() => onFlow('checklist', template.id)}><ClipboardCheck size={15} />{template.name}</button>
              ))}
            </div>
          ) : null}
          <div className="pair" style={{ marginTop: '.25rem' }}>
            <button type="button" className="btn secondary small" onClick={() => onFlow('delivery')}><ScanLine size={16} />{t('field2.scan')}</button>
            <button type="button" className="btn secondary small" onClick={() => onFlow('pv')}><FileSignature size={16} />{t('field2.sign')}</button>
          </div>
        </div>
      </section>
      {others.length ? (
        <section className="stack" style={{ gap: '.5rem' }}>
          <b>{t('field2.otherSites')}</b>
          {others.map((candidate) => (
            <button key={candidate.id} type="button" className="site-card" onClick={() => onSite(candidate.id)}>
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="trunc" style={{ display: 'block' }}>{candidate.code} · {candidate.name}</strong>
                <span className="progress" style={{ marginTop: '.4rem', display: 'block' }}><span style={{ width: `${candidate.progressPct}%` }} /></span>
              </span>
              <strong>{candidate.progressPct} %</strong>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces

function FlowHeader({ title, onClose, step, total, labels }: { title: string; onClose: () => void; step?: number; total?: number; labels?: string[] }) {
  const { t } = useI18n();
  return (
    <header className="stack" style={{ padding: '1rem 1rem .25rem', gap: '.6rem' }}>
      <div className="row nowrap"><b className="grow" style={{ fontSize: '1.15rem' }}>{title}</b>
        <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} aria-label={t('ui.close')} onClick={onClose}><X size={20} /></button></div>
      {step && total && labels ? (
        <div className="stepper" aria-label={t('ui.step', { n: step, total })}>
          {labels.map((label, index) => <span key={label} className={`st ${index + 1 === step ? 'on' : index + 1 < step ? 'done' : ''}`}><i />{label}</span>)}
        </div>
      ) : null}
    </header>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="field-footer"><div className="pair">{children}</div></div>;
}

function PhotoPicker({ photos, setPhotos, gps, site }: {
  photos: (OutboxPhoto & { url: string })[]; setPhotos: (update: (current: (OutboxPhoto & { url: string })[]) => (OutboxPhoto & { url: string })[]) => void;
  gps: { latitude: number; longitude: number } | null | undefined; site: FieldProject;
}) {
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="stack">
      <button type="button" onClick={() => input.current?.click()} className="stack" style={{ alignItems: 'center', justifyContent: 'center', gap: '.5rem', minHeight: 200, border: '2px dashed var(--line-strong)', borderRadius: 14, background: 'var(--sunken)', cursor: 'pointer', font: 'inherit', color: 'var(--ink-2)' }}>
        <span style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', color: '#fff' }}><Camera size={34} /></span>
        <b>{t('field2.tapToShoot')}</b>
        <span className="faint small">{site.code} · {gps ? `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : gps === null ? t('fieldApp.gpsUnavailable') : '…'} · {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date())}</span>
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        const position = gps ?? (await currentPosition());
        const added = await Promise.all(files.map(async (file) => {
          const blob = await compressPhoto(file);
          return { id: crypto.randomUUID(), blob, mediaType: 'image/jpeg' as const, takenAt: now(), latitude: position?.latitude ?? null, longitude: position?.longitude ?? null, url: URL.createObjectURL(blob) };
        }));
        setPhotos((current) => [...current, ...added].slice(0, 20));
      }} />
      {photos.length ? (
        <div className="thumbs">
          {photos.map((photo) => (
            <button key={photo.id} type="button" style={{ padding: 0, border: 0, background: 'none', position: 'relative' }} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} aria-label={t('app.remove')}>
              <img src={photo.url} alt="" /><span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 99, width: 22, height: 22, display: 'grid', placeItems: 'center' }}><X size={13} /></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- T4–T6: report in four steps

/**
 * Spec 048: the checklists of the day on a site: the daily ones, and those tied to a phase under way
 * there (started, not finished). On-demand checklists are offered as buttons.
 */
function appliesToday(template: { required: boolean; mode?: string; phaseName?: string | null }, site: FieldProject): boolean {
  if (template.mode === 'on_demand') return false;
  if (template.mode === 'phase') {
    const wanted = (template.phaseName ?? '').trim().toLowerCase();
    return site.phases.some((phase) => phase.name.trim().toLowerCase() === wanted && phase.progressPct > 0 && phase.progressPct < 100);
  }
  return template.required;
}

/** A task given to the site lead (spec 046): mark it done when the network is there. */
function FieldTask({ task }: { task: { id: string; title: string; dueOn: string | null; status: string; priority: string } }) {
  const { t } = useI18n();
  const [state, setState] = useState<'open' | 'sending' | 'done' | 'offline'>('open');
  const late = task.dueOn !== null && task.dueOn < new Date().toISOString().slice(0, 10);
  const finish = async () => {
    if (!navigator.onLine) { setState('offline'); return; }
    setState('sending');
    try { await updateTask({ data: { id: task.id, patch: { status: 'done' } } }); setState('done'); } catch { setState('offline'); }
  };
  return (
    <div className={`check-row ${state === 'done' ? 'on' : ''}`}>
      <button type="button" className="box" aria-label={t('tasks.statuses.done')} disabled={state === 'done' || state === 'sending'} onClick={() => void finish()}>{state === 'done' ? <Check size={16} /> : null}</button>
      <span className="grow">{task.title}{task.priority === 'urgent' ? <b className="bad-text"> · {t('tasks.priorities.urgent')}</b> : null}
        {state === 'offline' ? <span className="faint small" style={{ display: 'block' }}>{t('crew.taskNeedsNetwork')}</span> : null}</span>
      {task.dueOn ? <span className={`small ${late ? 'bad-text' : 'faint'}`}>{task.dueOn.slice(8, 10)}/{task.dueOn.slice(5, 7)}</span> : null}
    </div>
  );
}

function ReportFlow({ snapshot, initialSite, onCancel, onSaved }: { snapshot: FieldSnapshot; initialSite: FieldProject; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [siteId, setSiteId] = useState(initialSite.id);
  const site = snapshot.projects.find((candidate) => candidate.id === siteId) ?? initialSite;
  const [photos, setPhotos] = useState<(OutboxPhoto & { url: string })[]>([]);
  const [phaseId, setPhaseId] = useState<string | null>(site.phases.find((phase) => phase.progressPct > 0 && phase.progressPct < 100)?.id ?? null);
  const phase = site.phases.find((candidate) => candidate.id === phaseId) ?? null;
  const [progress, setProgress] = useState<number | null>(phase?.progressPct ?? null);
  const [note, setNote] = useState('');
  const [weather, setWeather] = useState<'sun' | 'rain' | 'wind' | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null | undefined>(undefined);
  const [voice, setVoice] = useState<{ blob: Blob; mediaType: string; seconds: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // Spec 047: who is present today, starting from the crew of the last day on this site.
  const workers = snapshot.workers ?? [];
  const [crew, setCrew] = useState<Set<string>>(() => new Set((site.lastCrew ?? []).filter((id) => workers.some((worker) => worker.id === id))));
  const toggleCrew = (id: string) => setCrew((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  useEffect(() => { void currentPosition().then(setGps); }, []);
  const labels = [t('field2.steps.site'), t('field2.steps.photos'), t('field2.steps.progress'), t('field2.steps.send')];
  const value = progress ?? phase?.progressPct ?? 0;
  const save = async () => {
    setBusy(true);
    const id = crypto.randomUUID();
    const weatherText = weather ? `[${t(`field2.${weather}` as MessageKey)}] ` : '';
    await enqueue({
      id, type: 'report', createdAt: now(), attempts: 0, lastError: null,
      payload: { id, projectId: site.id, phaseId, progressPct: phaseId ? value : null, note: `${weatherText}${note.trim()}`.trim() || null, latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null, takenAt: now(), workerIds: [...crew] },
      photos: photos.map(({ url: _url, ...photo }) => photo),
      audio: voice,
    });
    setBusy(false);
    await onSaved();
  };
  return (
    <div className="field-app">
      <FlowHeader title={t('field2.newReport')} onClose={onCancel} step={step} total={4} labels={labels} />
      <div className="field-body">
        {step === 1 ? snapshot.projects.map((candidate) => (
          <button key={candidate.id} type="button" className={`site-card ${candidate.id === siteId ? 'selected' : ''}`} onClick={() => { setSiteId(candidate.id); setPhaseId(null); setProgress(null); setCrew(new Set((candidate.lastCrew ?? []).filter((id) => workers.some((worker) => worker.id === id)))); }}>
            <span className="grow"><strong>{candidate.code} · {candidate.name}</strong><div className="muted small">{candidate.location ?? ''}</div></span><strong>{candidate.progressPct} %</strong>
          </button>
        )) : null}
        {step === 2 ? <PhotoPicker photos={photos} setPhotos={setPhotos} gps={gps} site={site} /> : null}
        {step === 3 ? (
          <div className="stack loose">
            <div className="stack" style={{ gap: '.5rem' }}>
              <b>{t('field2.choosePhase')}</b>
              <div className="chips">
                {site.phases.map((candidate) => (
                  <button key={candidate.id} type="button" className={`chip ${candidate.id === phaseId ? 'selected' : ''}`} onClick={() => { setPhaseId(candidate.id); setProgress(candidate.progressPct); }}>{candidate.name}</button>
                ))}
                <button type="button" className={`chip ${phaseId === null ? 'selected' : ''}`} onClick={() => { setPhaseId(null); setProgress(null); }}>{t('field2.noProgress')}</button>
              </div>
            </div>
            {phase ? (
              <div className="card stack">
                <b style={{ fontSize: '1.05rem' }}>{t('field2.whereIs', { phase: phase.name })}</b>
                <div className="row nowrap" style={{ alignItems: 'baseline' }}>
                  <span className="muted">{phase.progressPct} %</span><span className="muted">→</span>
                  <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--brand)' }}>{value} %</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={value} onChange={(event) => setProgress(Number(event.target.value))} aria-label={phase.name} style={{ minHeight: 44 }} />
                <div className="chips">
                  {[5, 10].map((step5) => <button key={step5} type="button" className="chip" onClick={() => setProgress(Math.min(100, value + step5))}>+{step5} %</button>)}
                  <button type="button" className="chip" onClick={() => setProgress(100)}>{t('field2.finished')}</button>
                </div>
              </div>
            ) : null}
            <div className="stack" style={{ gap: '.5rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{t('crew.presentToday', { n: crew.size })}</b>
                {workers.length ? <button type="button" className="btn ghost small" onClick={() => setCrew(crew.size ? new Set() : new Set(workers.map((worker) => worker.id)))}>{crew.size ? t('crew.none') : t('crew.all')}</button> : null}
              </div>
              {workers.length ? (
                <div className="chips">
                  {[...workers].sort((a, b) => Number((site.lastCrew ?? []).includes(b.id)) - Number((site.lastCrew ?? []).includes(a.id))).map((worker) => (
                    <button key={worker.id} type="button" className={`chip ${crew.has(worker.id) ? 'selected' : ''}`} aria-pressed={crew.has(worker.id)} onClick={() => toggleCrew(worker.id)}>
                      {crew.has(worker.id) ? <Check size={14} /> : null}{worker.name}{worker.trade ? <span className="faint small"> · {worker.trade}</span> : null}
                    </button>
                  ))}
                </div>
              ) : <span className="muted small">{t('crew.noWorkersField')}</span>}
            </div>
            <div className="stack" style={{ gap: '.5rem' }}>
              <VoiceRecorder voice={voice} onChange={setVoice} />
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('fieldApp.observationPlaceholder')} maxLength={4000} rows={3} />
            </div>
            <div className="stack" style={{ gap: '.5rem' }}>
              <b>{t('field2.weatherToday')}</b>
              <div className="chips">
                {([['sun', Sun], ['rain', CloudRain], ['wind', Wind]] as const).map(([key, Icon]) => (
                  <button key={key} type="button" className={`chip ${weather === key ? 'selected' : ''}`} onClick={() => setWeather(weather === key ? null : key)}><Icon size={16} />{t(`field2.${key}`)}</button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="card stack">
            <b>{t('field2.summary')}</b>
            <span>{site.code} · {site.name}</span>
            {photos.length ? <div className="thumbs">{photos.map((photo) => <img key={photo.id} src={photo.url} alt="" />)}</div> : null}
            {phase ? <span className="badge brand" style={{ alignSelf: 'flex-start' }}>{phase.name} : {phase.progressPct} % → {value} %</span> : null}
            {voice ? <span className="row tight small"><Mic size={14} />{t('fieldApp.voiceNote', { seconds: voice.seconds })}</span> : null}
            {crew.size ? <span className="row tight small"><Users size={14} />{t('crew.presentToday', { n: crew.size })}</span> : null}
            {note ? <p style={{ margin: 0 }}>{note}</p> : null}
            <span className="faint small row tight"><CloudOff size={14} />{t('field2.worksOffline')}</span>
          </div>
        ) : null}
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}>{step === 1 ? t('app.cancel') : t('app.back')}</button>
        {step < 4
          ? <button type="button" className="btn" onClick={() => setStep(step + 1)}>{t('app.next')}</button>
          : <button type="button" className="btn" disabled={busy || (!note.trim() && !photos.length && !phaseId && !voice)} onClick={() => void save()}>{t('fieldApp.send')}</button>}
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- T7: problem

function IncidentFlow({ site, onCancel, onSaved }: { site: FieldProject; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<string>('defect');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('important');
  const [description, setDescription] = useState('');
  return (
    <div className="field-app">
      <FlowHeader title={`${t('field2.problem')} · ${site.code}`} onClose={onCancel} />
      <div className="field-body">
        <div className="tiles">
          {INCIDENT_KINDS.map(([value, Icon]) => (
            <button key={value} type="button" className={`tile ${kind === value ? 'selected' : ''}`} onClick={() => setKind(value)}><Icon size={26} />{t(`field.kinds.${value}`)}</button>
          ))}
        </div>
        <div className="stack" style={{ gap: '.4rem' }}>
          <b>{t('field2.severity')}</b>
          <div className="seg" style={{ width: '100%' }}>
            {PRIORITIES.map((value) => (
              <button key={value} type="button" className={priority === value ? 'on' : ''} style={{ flex: 1, minHeight: 40, color: priority === value && value === 'critical' ? 'var(--bad)' : undefined }} onClick={() => setPriority(value)}>{t(`field.priorities.${value}`)}</button>
            ))}
          </div>
        </div>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('field2.explain')} maxLength={4000} rows={4} />
        <p className="faint small">{t('field2.whoWarned')}</p>
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={onCancel}>{t('app.cancel')}</button>
        <button type="button" className="btn" disabled={!description.trim()} onClick={async () => {
          const id = crypto.randomUUID();
          await enqueue({ id, type: 'incident', createdAt: now(), attempts: 0, lastError: null, payload: { id, projectId: site.id, kind, priority, description: description.trim() }, photos: [] });
          await onSaved();
        }}>{t('fieldApp.alertOffice')}</button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- T3: checklist

function ChecklistFlow({ site, template, onCancel, onSaved }: {
  site: FieldProject; template: { id: string; name: string; items: string[]; required: boolean } | null; onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState<boolean[]>(() => template?.items.map(() => false) ?? []);
  if (!template) return null;
  const count = checked.filter(Boolean).length;
  const save = async () => {
    const id = crypto.randomUUID();
    await enqueue({
      id, type: 'checklist', createdAt: now(), attempts: 0, lastError: null,
      payload: { id, projectId: site.id, templateId: template.id, name: template.name, items: template.items.map((label, index) => ({ label, done: Boolean(checked[index]) })), doneAt: now() },
      photos: [],
    });
    await onSaved();
  };
  return (
    <div className="field-app">
      <FlowHeader title={`${template.name} · ${site.code}`} onClose={onCancel} />
      <div className="field-body">
        <div className="row nowrap"><span className="grow muted small">{t('field2.mandatory')}</span><b className="num">{count} / {template.items.length}</b></div>
        <div className="progress"><span style={{ width: `${(count / template.items.length) * 100}%` }} /></div>
        {template.items.map((item, index) => (
          <button key={item} type="button" className={`check-row ${checked[index] ? 'on' : ''}`} aria-pressed={checked[index]}
            onClick={() => setChecked((current) => current.map((value, position) => (position === index ? !value : value)))}>
            <span className="box">{checked[index] ? <Check size={17} /> : null}</span><span className="grow">{item}</span>
          </button>
        ))}
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={onCancel}>{t('field2.later')}</button>
        <button type="button" className="btn" disabled={count === 0} onClick={() => void save()}>{t('field2.finishChecklist')}</button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- T8 + T10: delivery note read, then signed

function DeliveryFlow({ site, scanAvailable, onCancel, onSaved }: { site: FieldProject; scanAvailable: boolean; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [state, setState] = useState<'idle' | 'reading' | 'read' | 'offline' | 'unavailable'>('idle');
  const [fields, setFields] = useState({ supplier: '', item: '', quantity: '', unit: '', date: todayIso(), reference: '' });
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [verdict, setVerdict] = useState<'conform' | 'reserve'>('conform');
  const [note, setNote] = useState('');
  const [signer, setSigner] = useState('');
  const [role, setRole] = useState('');
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const read = async (blob: Blob) => {
    if (!navigator.onLine) { setState('offline'); return; }
    if (!scanAvailable) { setState('unavailable'); return; }
    setState('reading');
    try {
      const body = new FormData(); body.append('photo', blob, 'note.jpg');
      const response = await fetch('/api/field/scan', { method: 'POST', body, credentials: 'same-origin' });
      if (!response.ok) throw new Error('scan');
      const result = (await response.json()) as Record<string, string | number | null>;
      setExtracted(result);
      setFields((current) => ({
        supplier: String(result.supplier ?? current.supplier), item: String(result.item ?? current.item), quantity: result.quantity === null || result.quantity === undefined ? current.quantity : String(result.quantity),
        unit: String(result.unit ?? current.unit), date: String(result.date ?? current.date), reference: String(result.reference ?? current.reference),
      }));
      setState('read');
    } catch { setState('unavailable'); }
  };
  const field = (key: keyof typeof fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">{label}<input value={fields[key]} onChange={(event) => setFields({ ...fields, [key]: event.target.value })} {...props} /></label>
  );
  const save = async () => {
    const image = await pad.current?.toBlob();
    if (!image) return;
    setBusy(true);
    const id = crypto.randomUUID();
    const quantity = Number.parseFloat(fields.quantity.replace(',', '.'));
    await enqueue({
      id, type: 'delivery', createdAt: now(), attempts: 0, lastError: null, photo: photo?.blob ?? null, photos: [],
      payload: { id, projectId: site.id, supplier: fields.supplier || null, item: fields.item, quantity: Number.isFinite(quantity) ? quantity : null, unit: fields.unit || null,
        deliveredOn: fields.date, reference: fields.reference || null, verdict, note: note || null, extracted },
    });
    const sigId = crypto.randomUUID();
    await enqueue({
      id: sigId, type: 'signature', createdAt: now(), attempts: 0, lastError: null, image, photos: [],
      payload: { id: sigId, projectId: site.id, subjectKind: 'delivery', subjectId: id, title: `${fields.item}${fields.quantity ? ` · ${fields.quantity} ${fields.unit}` : ''}`.slice(0, 200),
        signerName: signer, signerRole: role || null, verdict, reserveNote: verdict === 'reserve' ? note || null : null },
    });
    setBusy(false);
    await onSaved();
  };
  return (
    <div className="field-app">
      <FlowHeader title={t('field2.scanTitle', { site: site.code })} onClose={onCancel} />
      <div className="field-body">
        {photo ? <img src={photo.url} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 10, background: 'var(--sunken)' }} /> : (
          <button type="button" className="btn secondary large" onClick={() => input.current?.click()}><ScanLine size={20} />{t('field2.takeNote')}</button>
        )}
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          const blob = await compressPhoto(file);
          setPhoto({ blob, url: URL.createObjectURL(blob) });
          await read(blob);
        }} />
        {state === 'reading' ? <div className="notice info"><RefreshCw size={16} />{t('field2.reading')}</div> : null}
        {state === 'read' ? <div className="notice ok"><CheckCircle2 size={16} />{t('field2.readOk')}</div> : null}
        {state === 'offline' ? <div className="notice"><CloudOff size={16} />{t('field2.readOffline')}</div> : null}
        {state === 'unavailable' ? <div className="notice">{t('field2.readUnavailable')}</div> : null}
        {field('supplier', t('field2.supplier'))}
        {field('item', t('field2.item'), { required: true })}
        <div className="pair">{field('quantity', t('field2.quantity'), { inputMode: 'decimal' })}{field('unit', t('field2.unit'))}</div>
        <div className="pair">{field('date', t('field2.date'), { type: 'date' })}{field('reference', t('field2.reference'))}</div>
        <div className="seg" style={{ width: '100%' }}>
          <button type="button" className={verdict === 'conform' ? 'on' : ''} style={{ flex: 1, minHeight: 40 }} onClick={() => setVerdict('conform')}>{t('field2.conform')}</button>
          <button type="button" className={verdict === 'reserve' ? 'on' : ''} style={{ flex: 1, minHeight: 40 }} onClick={() => setVerdict('reserve')}>{t('field2.withReserve')}</button>
        </div>
        {verdict === 'reserve' ? <label className="field">{t('field2.reserveNote')}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} /></label> : null}
        <div className="pair">
          <label className="field">{t('field2.signerName')}<input value={signer} onChange={(event) => setSigner(event.target.value)} /></label>
          <label className="field">{t('field2.signerRole')}<input value={role} onChange={(event) => setRole(event.target.value)} /></label>
        </div>
        <SignaturePad ref={pad} label={t('field2.signHere')} onChange={(empty) => setSigned(!empty)} />
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={onCancel}>{t('app.cancel')}</button>
        <button type="button" className="btn" disabled={busy || !fields.item.trim() || signer.trim().length < 2 || !signed} onClick={() => void save()}><PackageCheck size={18} />{t('app.save')}</button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- PV signed on site

function PvFlow({ site, onCancel, onSaved }: { site: FieldProject; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const pad = useRef<SignaturePadHandle>(null);
  const [subject, setSubject] = useState('');
  const [verdict, setVerdict] = useState<'conform' | 'reserve'>('conform');
  const [note, setNote] = useState('');
  const [signer, setSigner] = useState('');
  const [role, setRole] = useState('');
  const [signed, setSigned] = useState(false);
  return (
    <div className="field-app">
      <FlowHeader title={t('field2.pvTitle', { site: site.code })} onClose={onCancel} />
      <div className="field-body">
        <label className="field">{t('field2.pvSubject')}<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} /></label>
        <div className="seg" style={{ width: '100%' }}>
          <button type="button" className={verdict === 'conform' ? 'on' : ''} style={{ flex: 1, minHeight: 40 }} onClick={() => setVerdict('conform')}>{t('field2.conform')}</button>
          <button type="button" className={verdict === 'reserve' ? 'on' : ''} style={{ flex: 1, minHeight: 40 }} onClick={() => setVerdict('reserve')}>{t('field2.withReserve')}</button>
        </div>
        {verdict === 'reserve' ? <label className="field">{t('field2.reserveNote')}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} /></label> : null}
        <div className="pair">
          <label className="field">{t('field2.signerName')}<input value={signer} onChange={(event) => setSigner(event.target.value)} /></label>
          <label className="field">{t('field2.signerRole')}<input value={role} onChange={(event) => setRole(event.target.value)} /></label>
        </div>
        <SignaturePad ref={pad} label={t('field2.signHere')} onChange={(empty) => setSigned(!empty)} />
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={onCancel}>{t('app.cancel')}</button>
        <button type="button" className="btn" disabled={!subject.trim() || signer.trim().length < 2 || !signed} onClick={async () => {
          const image = await pad.current?.toBlob();
          if (!image) return;
          const id = crypto.randomUUID();
          await enqueue({ id, type: 'signature', createdAt: now(), attempts: 0, lastError: null, image, photos: [],
            payload: { id, projectId: site.id, subjectKind: 'pv', subjectId: null, title: subject.trim(), signerName: signer.trim(), signerRole: role || null, verdict, reserveNote: verdict === 'reserve' ? note || null : null } });
          await onSaved();
        }}><FileSignature size={18} />{t('clientPortal.signAndValidate')}</button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- confirmation

function Done({ kind, online, onHome, onAgain }: { kind: 'report' | 'checklist' | 'delivery' | 'pv' | 'incident'; online: boolean; onHome: () => void; onAgain: () => void }) {
  const { t } = useI18n();
  const title = kind === 'report' ? t('fieldApp.saved') : kind === 'checklist' ? t('field2.checklistSaved') : kind === 'delivery' ? t('field2.deliverySigned') : kind === 'pv' ? t('field2.pvSigned') : t('fieldApp.incidentSaved');
  return (
    <div className="field-app">
      <div className="field-body" style={{ alignItems: 'center', textAlign: 'center', paddingTop: '3rem' }}>
        <span style={{ width: 96, height: 96, borderRadius: '50%', background: online ? 'var(--ok-soft)' : 'var(--warn-soft)', color: online ? 'var(--ok)' : 'var(--warn)', display: 'grid', placeItems: 'center' }}>
          {online ? <CheckCircle2 size={52} /> : <CloudSun size={52} />}
        </span>
        <h2>{title}</h2>
        <p className="muted">{online ? (kind === 'report' ? t('field2.sentNow') : t('fieldApp.savedOnline')) : t('field2.savedOnPhone')}</p>
      </div>
      <Footer>
        <button type="button" className="btn secondary" onClick={onHome}>{t('fieldApp.home')}</button>
        {kind === 'checklist' ? <span /> : <button type="button" className="btn" onClick={onAgain}>{t('fieldApp.another')}</button>}
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------- voice

/** Records a voice note on the phone (kept in the outbox, transcribed by the server later). */
function VoiceRecorder({ voice, onChange }: {
  voice: { blob: Blob; mediaType: string; seconds: number } | null; onChange: (voice: { blob: Blob; mediaType: string; seconds: number } | null) => void;
}) {
  const { t } = useI18n();
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!voice) return setUrl(null);
    const next = URL.createObjectURL(voice.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [voice]);
  useEffect(() => {
    if (!recorder) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 180) recorder.stop();
    }, 500);
    return () => window.clearInterval(timer);
  }, [recorder]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
      const next = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      const began = Date.now();
      next.ondataavailable = (event) => chunks.push(event.data);
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mediaType = (next.mimeType || 'audio/webm').split(';')[0]!;
        onChange({ blob: new Blob(chunks, { type: mediaType }), mediaType, seconds: Math.max(1, Math.round((Date.now() - began) / 1000)) });
        setRecorder(null);
      };
      next.start(); setSeconds(0); setRecorder(next);
    } catch { setUnavailable(true); }
  };
  if (unavailable) return <p className="muted small">{t('fieldApp.micUnavailable')}</p>;
  if (recorder) {
    return (
      <div className="stack" style={{ alignItems: 'center', gap: '.4rem' }}>
        <button type="button" className="mic rec" aria-label={t('fieldApp.stopRecording')} onClick={() => recorder.stop()}><Square size={30} /></button>
        <span className="small">{t('fieldApp.recording', { seconds })}</span>
      </div>
    );
  }
  if (voice && url) {
    return (
      <div className="stack" style={{ gap: '.4rem' }}>
        <span className="small row tight"><Mic size={14} />{t('fieldApp.voiceNote', { seconds: voice.seconds })}</span>
        <audio controls src={url} style={{ width: '100%' }} />
        <button type="button" className="btn ghost small" onClick={() => onChange(null)}>{t('fieldApp.removeVoice')}</button>
      </div>
    );
  }
  return (
    <div className="stack" style={{ alignItems: 'center', gap: '.4rem' }}>
      <button type="button" className="mic" aria-label={t('field2.dictate')} onClick={() => void start()}><Mic size={34} /></button>
      <span className="small muted">{t('field2.dictate')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- spec 052: the office, from the field

/** The site's thread with the office, and the material asked for. Written offline too (outbox). */
function OfficeTab({ site, queue, canRequest, onQueued }: { site: FieldProject; queue: OutboxItem[]; canRequest: boolean; onQueued: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const [body, setBody] = useState('');
  const [asking, setAsking] = useState(false);
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const day = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const waitingNotes = queue.filter((item): item is Extract<OutboxItem, { type: 'note' }> => item.type === 'note' && item.payload.projectId === site.id);
  const waitingRequests = queue.filter((item): item is Extract<OutboxItem, { type: 'request' }> => item.type === 'request' && item.payload.projectId === site.id);
  const send = async () => {
    const text = body.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    await enqueue({ id, type: 'note', createdAt: new Date().toISOString(), attempts: 0, lastError: null, payload: { id, projectId: site.id, body: text }, photos: [] });
    setBody('');
    await onQueued();
  };
  const ask = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const item = String(data.get('item') ?? '').trim();
    if (!item) return;
    const id = crypto.randomUUID();
    const text = (name: string) => String(data.get(name) ?? '').trim() || null;
    await enqueue({ id, type: 'request', createdAt: new Date().toISOString(), attempts: 0, lastError: null, payload: { id, projectId: site.id, item, quantity: text('quantity'), neededOn: text('neededOn'), note: text('note') }, photos: [] });
    form.reset();
    setAsking(false);
    await onQueued();
  };
  const requests = site.requests ?? [];
  return (
    <div className="stack loose">
      <section className="stack" style={{ gap: '.6rem' }}>
        <div className="row nowrap"><h2 className="grow" style={{ margin: 0 }}>{t('fieldOffice.material')} · {site.code}</h2></div>
        {canRequest ? (asking ? (
          <form className="card stack" onSubmit={(event) => { event.preventDefault(); void ask(event.currentTarget); }}>
            <label className="field">{t('fieldOffice.item')}<input name="item" required maxLength={200} placeholder={t('fieldOffice.itemPlaceholder')} /></label>
            <div className="pair">
              <label className="field">{t('fieldOffice.quantity')}<input name="quantity" maxLength={80} placeholder={t('fieldOffice.quantityPlaceholder')} /></label>
              <label className="field">{t('fieldOffice.neededOn')}<input name="neededOn" type="date" min={new Date().toISOString().slice(0, 10)} /></label>
            </div>
            <label className="field">{t('fieldOffice.note')}<textarea name="note" rows={2} maxLength={1000} /></label>
            <div className="pair">
              <button type="button" className="btn secondary" onClick={() => setAsking(false)}>{t('app.cancel')}</button>
              <button type="submit" className="btn"><Truck size={18} />{t('fieldOffice.send')}</button>
            </div>
          </form>
        ) : <button type="button" className="btn block" onClick={() => setAsking(true)}><Truck size={18} />{t('fieldOffice.ask')}</button>) : null}
        {waitingRequests.map((item) => (
          <div key={item.id} className="card small row nowrap"><span className="grow"><b>{item.payload.item}</b>{item.payload.quantity ? ` · ${item.payload.quantity}` : ''}</span><span className="badge warn">{t('field2.waiting')}</span></div>
        ))}
        {requests.length ? requests.map((item) => (
          <div key={item.id} className="card small stack" style={{ gap: '.25rem' }}>
            <div className="row nowrap"><span className="grow"><b>{item.item}</b>{item.quantity ? ` · ${item.quantity}` : ''}</span>
              <span className={`badge ${item.status === 'delivered' ? 'ok' : item.status === 'cancelled' ? '' : item.status === 'ordered' ? 'info' : 'warn'}`}>{t(`material.statuses.${item.status}`)}</span></div>
            {item.neededOn ? <span className="muted">{t('fieldOffice.forDate', { date: day(item.neededOn) })}</span> : null}
            {item.officeNote ? <span>« {item.officeNote} »</span> : null}
          </div>
        )) : !waitingRequests.length ? <p className="muted small" style={{ margin: 0 }}>{t('fieldOffice.noRequest')}</p> : null}
      </section>

      <section className="stack" style={{ gap: '.6rem' }}>
        <h2 style={{ margin: 0 }}>{t('fieldOffice.thread')}</h2>
        <p className="muted small" style={{ margin: 0 }}>{t('fieldOffice.threadHint')}</p>
        <form className="row nowrap" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder={t('fieldOffice.write')} aria-label={t('fieldOffice.write')} style={{ flex: 1, minWidth: 0 }} />
          <button type="submit" className="btn" aria-label={t('fieldOffice.sendNote')}><Send size={18} /></button>
        </form>
        {waitingNotes.map((item) => (
          <div key={item.id} className="message mine"><div className="xsmall muted">{t('field2.waiting')}</div><div style={{ whiteSpace: 'pre-wrap' }}>{item.payload.body}</div></div>
        ))}
        {(site.notes ?? []).map((note) => (
          <div key={note.id} className={`message ${note.mine ? 'mine' : ''}`}>
            <div className="xsmall muted">{note.authorName} · {when(note.at)}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
          </div>
        ))}
        {!site.notes?.length && !waitingNotes.length ? <p className="muted small" style={{ margin: 0 }}>{t('fieldOffice.noNote')}</p> : null}
      </section>
    </div>
  );
}
