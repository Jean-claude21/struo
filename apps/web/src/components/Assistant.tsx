// The assistant panel (screen G7): ask a question in plain words, get an answer drawn only from the
// company's figures. Suggested questions to start; the last exchanges stay on screen.
import { useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { Panel } from './kit.tsx';
import { askAssistant } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export function AssistantPanel({ initial }: { initial?: string }) {
  const { t, errorText } = useI18n();
  const [question, setQuestion] = useState(initial ?? '');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: string; error?: boolean }[]>([]);
  const suggestions = [t('assistant.s1'), t('assistant.s2'), t('assistant.s3')];
  const ask = async (text: string) => {
    const clean = text.trim();
    if (clean.length < 3 || busy) return;
    setBusy(true); setQuestion('');
    try {
      const { answer } = await askAssistant({ data: { question: clean } });
      setHistory((current) => [...current.slice(-4), { q: clean, a: answer.replace(/\*\*(.+?)\*\*/gu, '$1').replace(/^#+\s*/gmu, '') }]);
    } catch (caught) {
      setHistory((current) => [...current.slice(-4), { q: clean, a: errorText(caught), error: true }]);
    } finally { setBusy(false); }
  };
  return (
    <Panel title={<span className="row tight"><Sparkles size={17} style={{ color: 'var(--brand)' }} />{t('assistant.title')}</span>} sub={t('assistant.sub')}>
      <div className="stack">
        {history.map((item, index) => (
          <div key={index} className="stack" style={{ gap: '.4rem' }}>
            <div className="message mine" style={{ maxWidth: '90%' }}>{item.q}</div>
            <div className="message" style={{ maxWidth: '95%', whiteSpace: 'pre-wrap', color: item.error ? 'var(--bad)' : undefined }}>
              <span className="row tight xsmall muted" style={{ marginBottom: '.2rem' }}><Bot size={13} />{t('assistant.name')}</span>{item.a}
            </div>
          </div>
        ))}
        {busy ? <p className="muted small" style={{ margin: 0 }}>{t('assistant.thinking')}</p> : null}
        {!history.length ? (
          <div className="chips">{suggestions.map((suggestion) => <button key={suggestion} type="button" className="chip" onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>
        ) : null}
        <form className="row nowrap" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('assistant.placeholder')} aria-label={t('assistant.placeholder')} maxLength={500} />
          <button type="submit" className="btn" disabled={busy || question.trim().length < 3} aria-label={t('assistant.ask')}><Send size={16} /></button>
        </form>
        <span className="faint xsmall">{t('assistant.note')}</span>
      </div>
    </Panel>
  );
}
