// The office side of the client report (spec 050): a draft written from the validated reports
// (assistant or template), section by section; the photos to show; then sent and frozen.
import type { ReportSection } from '@struo/core';
import { Check, FileText, Printer, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClientReportView } from './ClientReportView.tsx';
import { Panel, Seg, useToast } from './kit.tsx';
import {
  createClientReport, deleteClientReport, getClientReport, getClientReportTab, redraftClientReport, saveClientReportDraft, sendClientReport,
} from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

const REPORT_SECTIONS: ReportSection[] = ['summary', 'done', 'next', 'ask'];
type Tab = Awaited<ReturnType<typeof getClientReportTab>>;
type Draft = Awaited<ReturnType<typeof getClientReport>>;

const lastWeek = () => {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

export function ClientReportTab({ projectId, initialId }: { projectId: string; initialId?: string }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab | null>(null);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [range, setRange] = useState(lastWeek);
  const [busy, setBusy] = useState(false);
  const load = async (select?: string) => {
    const value = await getClientReportTab({ data: { projectId } });
    setTab(value);
    setSelected((current) => select ?? current ?? value.reports.find((item) => item.status === 'draft')?.id ?? value.reports[0]?.id ?? null);
  };
  useEffect(() => { void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const when = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  const day = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const create = async () => {
    setBusy(true);
    try { const { id } = await createClientReport({ data: { projectId, ...range } }); await load(id); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid-main">
      <div className="stack">
        {selected ? <ReportEditor key={selected} id={selected} tab={tab} onChanged={(id) => load(id)} onDeleted={async () => { setSelected(null); await load(); }} />
          : <Panel title={t('reportDraft.newTitle')}><p className="muted" style={{ margin: 0 }}>{t('reportDraft.newHint')}</p></Panel>}
      </div>
      <div className="stack">
        {tab?.canSend ? (
          <Panel title={t('reportDraft.newTitle')}>
            <div className="stack">
              <p className="small muted" style={{ margin: 0 }}>{t('reportDraft.newHint')}</p>
              <div className="form-grid">
                <label className="field">{t('clientReport.from')}<input type="date" value={range.from} max={range.to} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label>
                <label className="field">{t('clientReport.to')}<input type="date" value={range.to} min={range.from} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label>
              </div>
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void create()}><FileText size={16} />{busy ? t('reportDraft.creating') : t('reportDraft.create')}</button>
              <p className="small muted" style={{ margin: 0 }}>{tab.weekly ? t('clientReport.weeklyOn') : t('clientReport.weeklyOff')}</p>
            </div>
          </Panel>
        ) : null}
        <Panel title={t('reportDraft.list')} flush>
          {tab?.reports.length ? (
            <ul className="cr-list">{tab.reports.map((item) => (
              <li key={item.id}>
                <button type="button" className={item.id === selected ? 'on' : ''} onClick={() => setSelected(item.id)}>
                  <b>{day(item.from)} → {day(item.to)}</b>
                  <span className={`small ${item.status === 'draft' ? 'warn-text' : 'muted'}`}>
                    {item.status === 'draft' ? t('reportDraft.draft') : t('reportDraft.sentOn', { date: item.sentAt ? when(item.sentAt) : '' })}{item.automatic ? ` · ${t('reportDraft.auto')}` : ''}
                  </span>
                </button>
              </li>
            ))}</ul>
          ) : <p className="muted small" style={{ margin: '.8rem 1rem' }}>{t('reportDraft.none')}</p>}
        </Panel>
      </div>
    </div>
  );
}

function ReportEditor({ id, tab, onChanged, onDeleted }: { id: string; tab: Tab | null; onChanged: (id: string) => Promise<void>; onDeleted: () => Promise<void> }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => getClientReport({ data: { id } }).then(setDraft);
  useEffect(() => { void reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!draft) return <Panel title="…"><p className="muted">…</p></Panel>;
  const sent = draft.status === 'sent';
  const day = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try { await work(); await reload(); if (done) toast({ text: done }); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(null); }
  };
  const save = (patch: Record<string, unknown>) => run('save', () => saveClientReportDraft({ data: { id, patch } }));
  const chosen = draft.candidates.filter((photo) => photo.chosen).map((photo) => photo.id);
  const max = tab?.maxPhotos ?? 8;
  const toggle = (photoId: string) => {
    const next = chosen.includes(photoId) ? chosen.filter((value) => value !== photoId) : [...chosen, photoId];
    if (next.length > max) { toast({ text: t('reportDraft.photosCount', { n: chosen.length, max }), kind: 'err' }); return; }
    void save({ photoIds: next });
  };
  const send = () => run('send', async () => {
    const result = await sendClientReport({ data: { id } });
    toast({ text: result.mailed ? t('clientReport.sent', { email: tab?.contact?.email ?? '' }) : t('clientReport.savedNoMail') });
    await onChanged(id);
  });
  const remove = () => {
    if (!window.confirm(t('reportDraft.removeConfirm'))) return;
    void run('remove', async () => { await deleteClientReport({ data: { id } }); await onDeleted(); });
  };
  const title = sent ? t('reportDraft.sentTitle', { date: draft.sentAt ? day(draft.sentAt.slice(0, 10)) : '' }) : t('reportDraft.editTitle', { from: day(draft.report.period.from), to: day(draft.report.period.to) });
  return (
    <Panel title={title} sub={sent ? t('reportDraft.frozen') : (tab?.ai ? t('reportDraft.aiOn') : t('reportDraft.aiOff'))}
      actions={sent ? null : <Seg label={title} value={view} onChange={setView} items={[{ value: 'write', label: t('reportDraft.write') }, { value: 'preview', label: t('reportDraft.previewTab') }]} />}>
      {sent || view === 'preview' ? (
        <div className="cr-frame"><ClientReportView report={draft.report} orgId={draft.orgId} photoUrl={(photoId) => `/api/files/photo/${photoId}`} /></div>
      ) : (
        <div className="stack loose">
          <p className="small muted" style={{ margin: 0 }}>{t('reportDraft.figuresRule')}</p>
          {REPORT_SECTIONS.map((key) => (
            <SectionField key={key} section={key} value={draft.report.sections[key] ?? ''} warnings={draft.warnings[key] ?? []} ai={Boolean(tab?.ai)}
              busy={busy === `rewrite-${key}`} onSave={(text) => save({ sections: { [key]: text } })}
              onRewrite={(instruction) => run(`rewrite-${key}`, () => redraftClientReport({ data: { id, section: key, instruction } }))} />
          ))}
          <section className="stack" style={{ gap: '.5rem' }}>
            <div className="row nowrap"><b className="grow">{t('reportDraft.photos')}</b><span className="small muted">{t('reportDraft.photosCount', { n: chosen.length, max })}</span></div>
            <p className="small muted" style={{ margin: 0 }}>{t('reportDraft.photosHint')}</p>
            {draft.candidates.length ? (
              <div className="cr-pick">{draft.candidates.map((photo) => (
                <label key={photo.id} className={photo.chosen ? 'on' : ''}>
                  <input type="checkbox" checked={photo.chosen} onChange={() => toggle(photo.id)} disabled={busy === 'save'} />
                  <img src={`/api/files/photo/${photo.id}`} alt={photo.phase ?? ''} loading="lazy" />
                  <span>{[photo.phase, day(photo.takenAt)].filter(Boolean).join(' · ')}</span>
                  {photo.chosen ? <i aria-hidden="true"><Check size={14} /></i> : null}
                </label>
              ))}</div>
            ) : <p className="small muted" style={{ margin: 0 }}>{t('reportDraft.photosNone')}</p>}
          </section>
          <label className="field">{t('reportDraft.note')}
            <textarea rows={3} maxLength={2000} defaultValue={draft.report.note ?? ''} placeholder={t('clientReport.notePlaceholder')} onBlur={(event) => { if (event.target.value !== (draft.report.note ?? '')) void save({ note: event.target.value || null }); }} />
          </label>
        </div>
      )}
      {!sent ? (tab?.contact?.email ? <p className="small muted cr-to">{t('reportDraft.sendTo', { name: tab.contact.name ?? '', email: tab.contact.email })}</p>
        : <p className="small bad-text cr-to">{t('clientReport.noEmail')}</p>) : null}
      <div className="row cr-actions">
        {!sent ? (
          <>
            <button type="button" className="btn" disabled={!tab?.canSend || !tab.contact?.email || busy !== null} onClick={() => void send()}><Send size={16} />{busy === 'send' ? t('clientReport.sending') : t('clientReport.sendButton')}</button>
          </>
        ) : null}
        <a className="btn secondary" href={`/print/client-report?id=${id}`} target="_blank" rel="noreferrer"><Printer size={16} />{t('reportDraft.pdf')}</a>
        {!sent && tab?.canSend ? (
          <>
            <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => void run('redraft', () => redraftClientReport({ data: { id } }))}><Sparkles size={16} />{t('reportDraft.redraft')}</button>
            <button type="button" className="btn ghost" disabled={busy !== null} onClick={remove} aria-label={t('reportDraft.remove')}><Trash2 size={16} /></button>
          </>
        ) : null}
      </div>
      {!sent && tab?.contact?.email && !tab.contact.hasLink ? <p className="small muted" style={{ margin: 0 }}>{t('clientReport.oldLink')}</p> : null}
    </Panel>
  );
}

function SectionField({ section, value, warnings, ai, busy, onSave, onRewrite }: {
  section: ReportSection; value: string; warnings: string[]; ai: boolean; busy: boolean; onSave: (text: string | null) => void; onRewrite: (instruction: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  const [instruction, setInstruction] = useState('');
  useEffect(() => { setText(value); }, [value]);
  return (
    <div className="cr-field">
      <label className="field">{t(`reportDraft.sections.${section}`)}
        <textarea rows={section === 'done' ? 6 : 3} maxLength={3000} value={text} onChange={(event) => setText(event.target.value)}
          onBlur={() => { if (text !== value) onSave(text.trim() || null); }} />
        <span className="small faint">{t(`reportDraft.hints.${section}`)}</span>
      </label>
      {warnings.length ? <p className="small warn-text" role="status" style={{ margin: 0 }}>{t('reportDraft.figuresWarning', { figures: warnings.join(', ') })}</p> : null}
      {ai ? (
        <form className="row nowrap cr-rewrite" onSubmit={(event) => { event.preventDefault(); onRewrite(instruction); setInstruction(''); }}>
          <input value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={400} placeholder={t('reportDraft.rewritePlaceholder')} aria-label={t('reportDraft.rewrite')} />
          <button type="submit" className="btn ghost small" disabled={busy}><Sparkles size={14} />{busy ? t('reportDraft.rewriting') : t('reportDraft.rewrite')}</button>
        </form>
      ) : null}
    </div>
  );
}
