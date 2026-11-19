import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import {
  compressPhoto, currentPosition, enqueue, fetchSnapshot, outbox, persist, readSnapshot, syncOutbox, type FieldSnapshot, type OutboxItem,
  type OutboxPhoto,
} from '@/features/field/store.ts';
import { useI18n } from '@/i18n/index.tsx';

// The field app: rendered in the browser only (it must start without network), installable (PWA).
export const Route = createFileRoute('/field')({
  ssr: false,
  head: () => ({ links: [{ rel: 'manifest', href: '/manifest.webmanifest' }] }),
  component: FieldApp,
});

type View = { name: 'home' } | { name: 'report'; step: number } | { name: 'incident' } | { name: 'done'; online: boolean } | { name: 'queue' };

const INCIDENT_KINDS = ['material_delay', 'weather', 'defect', 'accident', 'equipment', 'other'] as const;
const PRIORITIES = ['critical', 'important', 'info'] as const;

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function FieldApp() {
  const { t, locale } = useI18n();
  const online = useOnline();
  const [snapshot, setSnapshot] = useState<FieldSnapshot | null>(null);
  const [queue, setQueue] = useState<OutboxItem[]>([]);
  const [view, setView] = useState<View>({ name: 'home' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setQueue(await outbox());
    if (navigator.onLine) {
      try {
        await syncOutbox();
        const fresh = await fetchSnapshot();
        if (fresh) setSnapshot(fresh);
        setAuthError(null);
      } catch (error) {
        setAuthError((error as Error).message);
      }
      setQueue(await outbox());
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await persist();
      setSnapshot((await readSnapshot()) ?? null);
      setQueue(await outbox());
      setLoaded(true);
      await refresh();
    })();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (online) void refresh();
  }, [online, refresh]);

  // Retry every minute while something waits.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!loaded) return <div className="field-app"><p className="field-body">{t('app.loading')}</p></div>;

  if (authError === 'not_signed_in' && !snapshot) {
    return (
      <div className="field-app">
        <div className="field-body" style={{ paddingTop: '2rem' }}>
          <p>{t('errors.not_signed_in')}</p>
          <a className="btn block" href="/login?next=/field">
            {t('auth.signIn')}
          </a>
        </div>
      </div>
    );
  }

  const pending = queue.length;
  const banner = online ? (
    <div className="banner online">{pending ? t('fieldApp.pending', { n: pending }) : t('fieldApp.allSent')}</div>
  ) : (
    <div className="banner offline">{t('fieldApp.offline', { n: pending })}</div>
  );

  return (
    <div className="field-app">
      <header className="field-header">
        <div>
          <div className="muted small">{snapshot?.company.name ?? 'Struo'}</div>
          <strong style={{ fontSize: '1.3rem' }}>
            {t('fieldApp.hello', { name: '' }).trim()} <span className="accent">{snapshot?.user.name.split(' ')[0] ?? ''}</span>
          </strong>
        </div>
        <LanguageSwitch />
      </header>
      <div className="field-body">
        {banner}
        {snapshot ? (
          <p className="muted small">{t('fieldApp.lastSync', { when: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.at)) })}</p>
        ) : (
          <p className="notice">{t('fieldApp.neverSynced')}</p>
        )}
        {view.name === 'home' ? <Home snapshot={snapshot} queue={queue} onView={setView} onSync={refresh} /> : null}
        {view.name === 'report' && snapshot ? (
          <ReportWizard
            snapshot={snapshot}
            onCancel={() => setView({ name: 'home' })}
            onSaved={async () => {
              setQueue(await outbox());
              setView({ name: 'done', online: navigator.onLine });
              if (navigator.onLine) await refresh();
            }}
          />
        ) : null}
        {view.name === 'incident' && snapshot ? (
          <IncidentForm
            snapshot={snapshot}
            onCancel={() => setView({ name: 'home' })}
            onSaved={async () => {
              setQueue(await outbox());
              setView({ name: 'home' });
              if (navigator.onLine) await refresh();
            }}
          />
        ) : null}
        {view.name === 'done' ? (
          <div className="stack" style={{ textAlign: 'center', paddingTop: '1rem' }}>
            <div className="big-check" aria-hidden="true">
              ✓
            </div>
            <h2>{t('fieldApp.saved')}</h2>
            <p className="muted">{view.online && !pending ? t('fieldApp.savedOnline') : t('fieldApp.savedOffline')}</p>
            <div className="pair">
              <button type="button" className="btn secondary" onClick={() => setView({ name: 'home' })}>
                {t('fieldApp.home')}
              </button>
              <button type="button" className="btn" onClick={() => setView({ name: 'report', step: 1 })}>
                {t('fieldApp.another')}
              </button>
            </div>
          </div>
        ) : null}
        {view.name === 'queue' ? (
          <div className="stack">
            <h2>{t('fieldApp.queue')}</h2>
            {queue.map((item) => (
              <div key={item.id} className="card">
                <strong>{item.type === 'report' ? t('fieldApp.newReport') : t('fieldApp.reportIncident')}</strong>
                <div className="muted small">
                  {snapshot?.projects.find((p) => p.id === item.payload.projectId)?.name ?? ''} · {item.photos.length ? t('fieldApp.photosCount', { n: item.photos.length }) : ''}
                </div>
                {item.lastError ? <div className="error small">{t('fieldApp.failed')} ({item.lastError})</div> : null}
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setView({ name: 'home' })}>
              {t('app.back')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Home({ snapshot, queue, onView, onSync }: { snapshot: FieldSnapshot | null; queue: OutboxItem[]; onView: (view: View) => void; onSync: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const canReport = snapshot?.user.canReport ?? false;
  return (
    <>
      <h2>{t('fieldApp.mySites')}</h2>
      {snapshot?.projects.length ? (
        snapshot.projects.map((project) => (
          <div key={project.id} className="site-card" style={{ cursor: 'default' }}>
            <div className="grow">
              <strong>{project.name}</strong>
              <div className="muted small">
                {project.code}
                {project.location ? ` · ${project.location}` : ''}
              </div>
              <div className="progress" style={{ marginTop: '.4rem' }}>
                <span style={{ width: `${project.progressPct}%` }} />
              </div>
            </div>
            <div className="right">
              <strong>{project.progressPct} %</strong>
              <div>
                <span className={`badge ${project.status}`}>{t(`status.${project.status as 'active'}`)}</span>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="muted">{t('app.empty')}</p>
      )}
      <div className="row">
        {queue.length ? (
          <button type="button" className="btn secondary small" onClick={() => onView({ name: 'queue' })}>
            {t('fieldApp.queue')} ({queue.length})
          </button>
        ) : null}
        <button
          type="button"
          className="btn secondary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSync();
            setBusy(false);
          }}
        >
          {t('fieldApp.syncNow')}
        </button>
        <a href="/app" className="btn ghost small">
          {t('fieldApp.backToOffice')}
        </a>
      </div>
      <div className="field-footer">
        <div className="stack" style={{ gap: '.5rem' }}>
          {canReport ? (
            <>
              <button type="button" className="btn block" disabled={!snapshot?.projects.length} onClick={() => onView({ name: 'report', step: 1 })}>
                📷 {t('fieldApp.newReport')}
              </button>
              <button type="button" className="btn secondary block" disabled={!snapshot?.projects.length} onClick={() => onView({ name: 'incident' })}>
                ⚠ {t('fieldApp.reportIncident')}
              </button>
            </>
          ) : snapshot ? (
            <p className="muted small">{t('fieldApp.notAllowed')}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ReportWizard({ snapshot, onCancel, onSaved }: { snapshot: FieldSnapshot; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState<string>(snapshot.projects[0]?.id ?? '');
  const [photos, setPhotos] = useState<(OutboxPhoto & { url: string })[]>([]);
  const project = snapshot.projects.find((p) => p.id === projectId);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentPosition().then(setGps);
  }, []);
  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)), [photos]);

  const phase = project?.phases.find((p) => p.id === phaseId);
  const total = 3;
  return (
    <div className="stack">
      <div className="muted small">{t('fieldApp.step', { n: step, total })}</div>
      <div className="progress">
        <span style={{ width: `${(step / total) * 100}%` }} />
      </div>
      {step === 1 ? (
        <>
          <h2>{t('fieldApp.chooseSite')}</h2>
          {snapshot.projects.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`site-card ${candidate.id === projectId ? 'selected' : ''}`}
              onClick={() => {
                setProjectId(candidate.id);
                setPhaseId(null);
                setProgress(null);
              }}
            >
              <span className="grow">
                <strong>{candidate.name}</strong>
                <div className="muted small">{candidate.code}</div>
              </span>
              <strong>{candidate.progressPct} %</strong>
            </button>
          ))}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h2>{t('fieldApp.takePhotos')}</h2>
          <label className="btn secondary block" style={{ cursor: 'pointer' }}>
            📷 {t('fieldApp.addPhoto')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                const position = gps ?? (await currentPosition());
                const added = await Promise.all(
                  files.map(async (file) => {
                    const blob = await compressPhoto(file);
                    return {
                      id: crypto.randomUUID(), blob, mediaType: 'image/jpeg' as const, takenAt: new Date().toISOString(),
                      latitude: position?.latitude ?? null, longitude: position?.longitude ?? null, url: URL.createObjectURL(blob),
                    };
                  }),
                );
                setPhotos((current) => [...current, ...added].slice(0, 20));
              }}
            />
          </label>
          <p className="small muted">
            {t('fieldApp.photosCount', { n: photos.length })} · {gps ? `📍 ${t('fieldApp.gpsOk')} (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})` : gps === null ? t('fieldApp.gpsUnavailable') : '…'}
          </p>
          <div className="thumbs">
            {photos.map((photo) => (
              <button key={photo.id} type="button" style={{ padding: 0, border: 0, background: 'none' }} onClick={() => setPhotos((current) => current.filter((p) => p.id !== photo.id))} aria-label={t('app.remove')}>
                <img src={photo.url} alt="" />
              </button>
            ))}
          </div>
        </>
      ) : null}
      {step === 3 && project ? (
        <>
          <h2>{t('fieldApp.phase')}</h2>
          <div className="chips">
            {project.phases.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={`chip ${candidate.id === phaseId ? 'selected' : ''}`}
                onClick={() => {
                  setPhaseId(candidate.id);
                  setProgress(candidate.progressPct);
                }}
              >
                {candidate.name}
              </button>
            ))}
          </div>
          {phase ? (
            <label className="field">
              <span>
                {t('fieldApp.progress')} : <strong className="accent">{progress ?? phase.progressPct} %</strong>
              </span>
              <input type="range" min={0} max={100} step={5} value={progress ?? phase.progressPct} onChange={(event) => setProgress(Number(event.target.value))} />
            </label>
          ) : null}
          <label className="field">
            <span>{t('fieldApp.observation')}</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('fieldApp.observationPlaceholder')} maxLength={4000} />
          </label>
        </>
      ) : null}
      <div className="field-footer">
        <div className="pair">
          <button type="button" className="btn secondary" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}>
            {step === 1 ? t('app.cancel') : t('app.back')}
          </button>
          {step < total ? (
            <button type="button" className="btn" disabled={!projectId} onClick={() => setStep(step + 1)}>
              {t('app.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy || (!note.trim() && !photos.length && !phaseId)}
              onClick={async () => {
                setBusy(true);
                const id = crypto.randomUUID();
                await enqueue({
                  id,
                  type: 'report',
                  createdAt: new Date().toISOString(),
                  attempts: 0,
                  lastError: null,
                  payload: {
                    id, projectId, phaseId, progressPct: phaseId ? (progress ?? phase?.progressPct ?? null) : null, note: note.trim() || null,
                    latitude: gps?.latitude ?? null, longitude: gps?.longitude ?? null, takenAt: new Date().toISOString(),
                  },
                  photos: photos.map(({ url: _url, ...photo }) => photo),
                });
                setBusy(false);
                await onSaved();
              }}
            >
              {t('fieldApp.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function IncidentForm({ snapshot, onCancel, onSaved }: { snapshot: FieldSnapshot; onCancel: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState(snapshot.projects[0]?.id ?? '');
  const [kind, setKind] = useState<(typeof INCIDENT_KINDS)[number]>('material_delay');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('important');
  const [description, setDescription] = useState('');
  return (
    <div className="stack">
      <h2>{t('fieldApp.reportIncident')}</h2>
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label={t('app.project')}>
        {snapshot.projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.code} — {project.name}
          </option>
        ))}
      </select>
      <div className="tiles">
        {INCIDENT_KINDS.map((value) => (
          <button key={value} type="button" className={`tile ${kind === value ? 'selected' : ''}`} onClick={() => setKind(value)}>
            {t(`field.kinds.${value}`)}
          </button>
        ))}
      </div>
      <div>
        <div className="small" style={{ fontWeight: 600, marginBottom: '.4rem' }}>
          {t('fieldApp.priority')}
        </div>
        <div className="chips">
          {PRIORITIES.map((value) => (
            <button key={value} type="button" className={`chip ${priority === value ? 'selected' : ''}`} onClick={() => setPriority(value)}>
              {t(`field.priorities.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('fieldApp.describe')} maxLength={4000} />
      <div className="field-footer">
        <div className="pair">
          <button type="button" className="btn secondary" onClick={onCancel}>
            {t('app.cancel')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!description.trim() || !projectId}
            onClick={async () => {
              const id = crypto.randomUUID();
              await enqueue({
                id, type: 'incident', createdAt: new Date().toISOString(), attempts: 0, lastError: null,
                payload: { id, projectId, kind, priority, description: description.trim() }, photos: [],
              });
              await onSaved();
            }}
          >
            {t('fieldApp.alertOffice')}
          </button>
        </div>
      </div>
    </div>
  );
}
