// Struo Intelligence (spec 034): the assistant beside every page — the top bar button, Ctrl J, or a
// question typed in Ctrl K. It knows the page and the site open, shows what it does as it does it
// (each capability with its level), writes its answer live, lists its sources, and turns what
// commits into draft cards the person validates. « Arrêter » stops it. A panel, not a dialog: the
// page stays usable beside it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ArrowUp, Check, CircleAlert, ExternalLink, FileCheck2, Loader2, Maximize2, Mic, Minimize2, Plus, Settings2, Sparkles, Square, X } from 'lucide-react';
import { getAssistantStatus } from '@/features/intelligence/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Level = 1 | 2 | 3 | 4;
interface Tool { id: string; name: string; level: Level; state: 'running' | 'ok' | 'failed'; error?: string }
interface Draft { id: string; name: string; level: Level; summary: string; token: string; state: 'waiting' | 'running' | 'done' | 'dismissed' | 'failed'; error?: string }
interface Source { kind: string; label: string; href: string }
interface Turn {
  question: string; answer: string; status: string | null; tools: Tool[]; drafts: Draft[]; sources: Source[];
  running: boolean; failed?: string; ms?: number; payer?: string;
}

interface Ctx { open: (question?: string) => void; toggle: () => void; isOpen: boolean }
const IntelligenceContext = createContext<Ctx>({ open: () => undefined, toggle: () => undefined, isOpen: false });
export const useAssistant = () => useContext(IntelligenceContext);

const STORE = 'struo.intelligence.turns';

/** Where the person asks from: the page, and the site when one is open. */
function usePageContext() {
  const { t } = useI18n();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const projectId = path.match(/^\/app\/projects\/([0-9a-f-]{36})/u)?.[1];
  const section = path.split('/')[2] ?? '';
  const labels: Record<string, MessageKey> = {
    '': 'shell.today', projects: 'shell.sites', planning: 'shell.planning', field: 'shell.field', finance: 'shell.finance', expenses: 'shell.expenses',
    documents: 'shell.documents', clients: 'shell.clients', team: 'shell.team', settings: 'shell.settings', intelligence: 'ai.title',
  };
  const label = projectId ? (typeof document !== 'undefined' ? document.querySelector('h1')?.textContent ?? t('shell.sites') : t('shell.sites')) : t(labels[section] ?? 'shell.today');
  return { path, projectId, label, section };
}

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const open = useCallback((question?: string) => { setOpen(true); if (question) setPending(question); }, []);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'j' || event.key === 'J') && (event.ctrlKey || event.metaKey)) { event.preventDefault(); setOpen((value) => !value); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const value = useMemo(() => ({ open, toggle, isOpen }), [open, toggle, isOpen]);
  return (
    <IntelligenceContext.Provider value={value}>
      {children}
      {isOpen ? <Panel onClose={() => setOpen(false)} pending={pending} onPendingTaken={() => setPending(null)} /> : null}
    </IntelligenceContext.Provider>
  );
}

/** The top bar button. */
export function AssistantButton() {
  const { t } = useI18n();
  const { toggle, isOpen } = useAssistant();
  return (
    <button type="button" className={`btn ai-btn small ${isOpen ? 'on' : ''}`} onClick={toggle} aria-pressed={isOpen} title={`${t('ai.open')} · Ctrl J`}>
      <Sparkles size={15} /><span className="hide-m">{t('ai.short')}</span><span className="kbd hide-m">Ctrl J</span>
    </button>
  );
}

const SUGGESTIONS: Record<string, MessageKey[]> = {
  '': ['ai.s.today1', 'ai.s.today2', 'ai.s.today3'],
  projects: ['ai.s.sites1', 'ai.s.sites2', 'ai.s.sites3'],
  site: ['ai.s.site1', 'ai.s.site2', 'ai.s.site3'],
  planning: ['ai.s.plan1', 'ai.s.plan2', 'ai.s.plan3'],
  finance: ['ai.s.fin1', 'ai.s.fin2', 'ai.s.fin3'],
  field: ['ai.s.field1', 'ai.s.field2', 'ai.s.field3'],
  documents: ['ai.s.docs1', 'ai.s.docs2'],
  expenses: ['ai.s.exp1', 'ai.s.exp2'],
  clients: ['ai.s.cli1', 'ai.s.cli2'],
};

function Panel({ onClose, pending, onPendingTaken }: { onClose: () => void; pending: string | null; onPendingTaken: () => void }) {
  const { t, errorText } = useI18n();
  const page = usePageContext();
  const [turns, setTurns] = useState<Turn[]>(() => {
    try { return (JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as Turn[]).map((turn) => ({ ...turn, running: false })); } catch { return []; }
  });
  const [question, setQuestion] = useState('');
  const [wide, setWide] = useState(false);
  const [withPage, setWithPage] = useState(true);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getAssistantStatus>> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const running = turns.some((turn) => turn.running);

  useEffect(() => { void getAssistantStatus().then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-12))); } catch { /* not kept */ } }, [turns]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.modal, .pop')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchLast = (update: (turn: Turn) => Turn) => setTurns((current) => current.map((turn, index) => (index === current.length - 1 ? update(turn) : turn)));

  const ask = async (text: string) => {
    const clean = text.trim();
    if (clean.length < 2 || running) return;
    setQuestion('');
    const history = turns.filter((turn) => turn.answer && !turn.failed).slice(-5).map((turn) => ({ q: turn.question, a: turn.answer.slice(0, 4000) }));
    setTurns((current) => [...current, { question: clean, answer: '', status: 'thinking', tools: [], drafts: [], sources: [], running: true }]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch('/api/intelligence', {
        method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: clean, history, page: withPage ? { path: page.path, label: page.label, projectId: page.projectId } : { path: page.path } }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        patchLast((turn) => ({ ...turn, running: false, status: null, failed: body.error ?? 'assistant_failed' }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line) as Record<string, unknown> & { type: string };
          patchLast((turn) => apply(turn, event));
        }
      }
      patchLast((turn) => ({ ...turn, running: false, status: null }));
    } catch {
      patchLast((turn) => ({ ...turn, running: false, status: null, ...(controller.signal.aborted ? {} : { failed: 'assistant_failed' }) }));
    } finally {
      abort.current = null;
    }
  };

  useEffect(() => {
    if (pending && !running) { onPendingTaken(); void ask(pending); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const confirm = async (turnIndex: number, draft: Draft, dismiss = false) => {
    const set = (patch: Partial<Draft>) => setTurns((current) => current.map((turn, index) => (index === turnIndex
      ? { ...turn, drafts: turn.drafts.map((item) => (item.id === draft.id ? { ...item, ...patch } : item)) } : turn)));
    if (dismiss) { set({ state: 'dismissed' }); return; }
    set({ state: 'running' });
    const response = await fetch('/api/intelligence/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: draft.token }) });
    if (response.ok) set({ state: 'done' });
    else set({ state: 'failed', error: ((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'generic' });
  };

  const suggestions = (SUGGESTIONS[page.projectId ? 'site' : page.section] ?? SUGGESTIONS['']!).map((key) => t(key));

  return (
    <aside className={`ai-panel ${wide ? 'wide' : ''}`} aria-label={t('ai.title')}>
      <header className="ai-head">
        <span className="ai-mark"><Sparkles size={16} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b>{t('ai.title')}</b>
          <div className="xsmall muted trunc">{status ? (status.ready ? t(`ai.payer.${status.payer}` as MessageKey, { hint: status.hint ?? '' }) : t('ai.notReady')) : '…'}</div>
        </div>
        <button type="button" className="icon-btn sm" aria-label={t('ai.new')} title={t('ai.new')} disabled={running} onClick={() => setTurns([])}><Plus size={15} /></button>
        <a className="icon-btn sm" href="/app/intelligence" aria-label={t('ai.settings')} title={t('ai.settings')}><Settings2 size={15} /></a>
        <button type="button" className="icon-btn sm hide-m" aria-label={t('ai.wider')} onClick={() => setWide((value) => !value)}>{wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        <button type="button" className="icon-btn sm" aria-label={t('ui.close')} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="ai-body">
        {!turns.length ? (
          <div className="stack" style={{ gap: '.75rem' }}>
            <p className="muted small" style={{ margin: 0 }}>{t('ai.intro')}</p>
            {status && !status.ready ? <a className="notice warn small" href="/app/intelligence">{t('ai.connectFirst')}</a> : null}
          </div>
        ) : null}
        {turns.map((turn, turnIndex) => (
          <div key={turnIndex} className="ai-turn">
            <div className="ai-q">{turn.question}</div>
            {turn.tools.length ? (
              <div className="ai-tools">
                {turn.tools.map((tool) => (
                  <span key={tool.id} className={`ai-tool ${tool.state}`} title={tool.error ? errorText(tool.error) : undefined}>
                    {tool.state === 'running' ? <Loader2 size={12} className="spin" /> : tool.state === 'ok' ? <Check size={12} /> : <CircleAlert size={12} />}
                    <code>{tool.name}</code><span className={`lvl l${tool.level}`}>{tool.level}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {turn.running && turn.status && !turn.answer ? <div className="ai-status"><Loader2 size={13} className="spin" />{t(`ai.status.${turn.status}` as MessageKey)}</div> : null}
            {turn.answer ? <div className="ai-a">{turn.answer.replace(/\*\*(.+?)\*\*/gu, '$1').replace(/^#+\s*/gmu, '')}</div> : null}
            {turn.drafts.map((draft) => (
              <div key={draft.id} className={`ai-draft ${draft.state}`}>
                <div className="row tight nowrap"><FileCheck2 size={15} /><b className="grow">{t(`caps.${draft.name}` as MessageKey)}</b>
                  <span className={`badge ${draft.level === 4 ? 'bad' : 'warn'}`}>{t(draft.level === 4 ? 'ai.confirmNeeded' : 'ai.draft')}</span></div>
                <div className="small" style={{ margin: '.35rem 0 .5rem' }}>{draft.summary}</div>
                {draft.state === 'waiting' ? (
                  <div className="row tight">
                    <button type="button" className="btn small" onClick={() => void confirm(turnIndex, draft)}><Check size={14} />{t('ai.validate')}</button>
                    <button type="button" className="btn ghost small" onClick={() => void confirm(turnIndex, draft, true)}>{t('ai.dismiss')}</button>
                  </div>
                ) : draft.state === 'running' ? <span className="small muted"><Loader2 size={13} className="spin" /> {t('ui.loading')}</span>
                  : draft.state === 'done' ? <span className="small" style={{ color: 'var(--ok)' }}><Check size={13} /> {t('ai.done')}</span>
                  : draft.state === 'failed' ? <span className="small" style={{ color: 'var(--bad)' }}>{errorText(draft.error ?? 'generic')}</span>
                  : <span className="small muted">{t('ai.dismissed')}</span>}
              </div>
            ))}
            {turn.sources.length ? (
              <div className="ai-sources">{turn.sources.map((source) => <a key={source.href} href={source.href}><ExternalLink size={12} />{source.label}</a>)}</div>
            ) : null}
            {turn.failed ? <div className="notice warn small">{errorText(turn.failed)}{['assistant_unavailable', 'ai_connection_required', 'ai_reconnect'].includes(turn.failed) ? <> · <a href="/app/intelligence">{t('ai.settings')}</a></> : null}</div> : null}
            {!turn.running && turn.ms !== undefined && !turn.failed ? (
              <div className="faint xsmall">{t('ai.meta', { n: turn.tools.length, s: Math.max(1, Math.round(turn.ms / 1000)) })}</div>
            ) : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      <footer className="ai-foot">
        {!running ? <div className="chips" style={{ marginBottom: '.5rem' }}>{suggestions.map((item) => <button key={item} type="button" className="chip small" onClick={() => void ask(item)}>{item}</button>)}</div> : null}
        {withPage ? (
          <div className="row tight xsmall" style={{ marginBottom: '.4rem' }}>
            <span className="badge">{t('ai.about')} {page.label}</span>
            <button type="button" className="icon-btn sm" aria-label={t('ai.forget')} onClick={() => setWithPage(false)}><X size={12} /></button>
          </div>
        ) : null}
        <form className="ai-field" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
          <textarea value={question} rows={2} maxLength={2000} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} autoFocus
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(question); } }} />
          <Dictate onText={(text) => setQuestion((current) => `${current}${current ? ' ' : ''}${text}`)} />
          {running ? (
            <button type="button" className="btn small danger" onClick={() => abort.current?.abort()} aria-label={t('ai.stop')}><Square size={13} />{t('ai.stop')}</button>
          ) : (
            <button type="submit" className="btn small" disabled={question.trim().length < 2} aria-label={t('ai.send')}><ArrowUp size={15} /></button>
          )}
        </form>
      </footer>
    </aside>
  );
}

function apply(turn: Turn, event: Record<string, unknown> & { type: string }): Turn {
  switch (event.type) {
    case 'start': return { ...turn, payer: String(event.payer) };
    case 'status': return { ...turn, status: String(event.text) };
    case 'calling': return { ...turn, status: 'reading', tools: [...turn.tools, { id: String(event.id), name: String(event.name), level: event.level as Level, state: 'running' }] };
    case 'call': return { ...turn, tools: turn.tools.some((tool) => tool.id === event.id)
      ? turn.tools.map((tool) => (tool.id === event.id ? { ...tool, state: event.ok ? 'ok' : 'failed', error: event.error as string | undefined } : tool))
      : [...turn.tools, { id: String(event.id), name: String(event.name), level: 1, state: event.ok ? 'ok' : 'failed', error: event.error as string | undefined }] };
    case 'text': return { ...turn, answer: turn.answer + String(event.delta ?? ''), status: null };
    case 'draft': return { ...turn, drafts: [...turn.drafts, { id: String(event.id), name: String(event.name), level: event.level as Level, summary: String(event.summary), token: String(event.token), state: 'waiting' }] };
    case 'source': return { ...turn, sources: [...turn.sources, event.source as Source] };
    case 'done': return { ...turn, running: false, status: null, ms: Number(event.ms) };
    case 'failed': return { ...turn, running: false, status: null, failed: String(event.code) };
    default: return turn;
  }
}

/** Her voice written as she speaks, where the browser offers it. */
function Dictate({ onText }: { onText: (text: string) => void }) {
  const { t, locale } = useI18n();
  const [listening, setListening] = useState(false);
  const recognition = useRef<{ stop: () => void } | null>(null);
  type Recognition = { lang: string; interimResults: boolean; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };
  const Ctor = typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition) : undefined;
  if (!Ctor) return null;
  return (
    <button type="button" className={`icon-btn ${listening ? 'on' : ''}`} aria-pressed={listening} aria-label={t('ai.dictate')} title={t('ai.dictate')}
      onClick={() => {
        if (listening) { recognition.current?.stop(); return; }
        const instance = new Ctor();
        instance.lang = locale === 'en' ? 'en-GB' : 'fr-FR';
        instance.interimResults = false;
        instance.onresult = (event) => { const text = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' '); if (text) onText(text); };
        instance.onend = () => setListening(false);
        recognition.current = instance;
        setListening(true);
        instance.start();
      }}><Mic size={15} /></button>
  );
}

/** On « Today »: a question field and suggestions that open the drawer with the question. */
export function AskCard({ initial }: { initial?: string }) {
  const { t } = useI18n();
  const { open } = useAssistant();
  const [question, setQuestion] = useState('');
  useEffect(() => { if (initial) open(initial); }, [initial, open]);
  return (
    <section className="panel ai-card">
      <div className="row tight"><span className="ai-mark"><Sparkles size={15} /></span><b>{t('ai.cardTitle')}</b><span className="faint xsmall hide-m">{t('ai.cardSub')}</span></div>
      <form className="ai-field" style={{ marginTop: '.6rem' }} onSubmit={(event) => { event.preventDefault(); if (question.trim().length >= 2) { open(question.trim()); setQuestion(''); } }}>
        <textarea rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (question.trim().length >= 2) { open(question.trim()); setQuestion(''); } } }} />
        <button type="submit" className="btn small" disabled={question.trim().length < 2} aria-label={t('ai.send')}><ArrowUp size={15} /></button>
      </form>
      <div className="chips" style={{ marginTop: '.5rem' }}>
        {(['ai.s.today1', 'ai.s.today2', 'ai.s.today3'] as const).map((key) => <button key={key} type="button" className="chip small" onClick={() => open(t(key))}>{t(key)}</button>)}
      </div>
    </section>
  );
}
