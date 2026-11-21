// Spec 055: what the platform says to every company (an announcement for a period), and what a
// member says back (a problem or an idea, read in the founder's console).
import { getRouteApi, useRouterState } from '@tanstack/react-router';
import { Lightbulb, Megaphone, MessageSquareWarning, X } from 'lucide-react';
import { useState } from 'react';
import { Modal, useToast } from './kit.tsx';
import { sendFeedback } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

const root = getRouteApi('__root__');

export function AnnouncementBar() {
  const data = root.useLoaderData() as { announcement?: { id: string; title: string; body: string | null; level: 'info' | 'warning' } | null } | undefined;
  const announcement = data?.announcement ?? null;
  const [hidden, setHidden] = useState(() => {
    try { return announcement ? localStorage.getItem('struo-announce') === announcement.id : false; } catch { return false; }
  });
  const { t } = useI18n();
  if (!announcement || hidden) return null;
  return (
    <div className={`notice ${announcement.level === 'warning' ? 'warn' : 'info'} announce`} role="status">
      <Megaphone size={18} />
      <div className="grow"><b>{announcement.title}</b>{announcement.body ? <div className="small" style={{ whiteSpace: 'pre-line' }}>{announcement.body}</div> : null}</div>
      <button type="button" className="btn ghost small" aria-label={t('announce.hide')} onClick={() => { try { localStorage.setItem('struo-announce', announcement.id); } catch { /* private mode */ } setHidden(true); }}><X size={16} /></button>
    </div>
  );
}

export function FeedbackButton() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'problem' | 'idea'>('problem');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await sendFeedback({ data: { kind, body, page: path } }); toast({ text: t('feedback.thanks') }); setBody(''); setOpen(false); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="feedback-fab" onClick={() => setOpen(true)} aria-label={t('feedback.open')}><MessageSquareWarning size={18} /><span>{t('feedback.open')}</span></button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('feedback.title')}
        footer={(<><button type="button" className="btn secondary" onClick={() => setOpen(false)}>{t('app.cancel')}</button>
          <button type="button" className="btn" disabled={busy || body.trim().length < 2} onClick={() => void send()}>{t('feedback.send')}</button></>)}>
        <div className="stack">
          <div className="pair">
            <button type="button" className={`btn ${kind === 'problem' ? '' : 'secondary'}`} onClick={() => setKind('problem')}><MessageSquareWarning size={16} />{t('feedback.problem')}</button>
            <button type="button" className={`btn ${kind === 'idea' ? '' : 'secondary'}`} onClick={() => setKind('idea')}><Lightbulb size={16} />{t('feedback.idea')}</button>
          </div>
          <label className="field">{kind === 'problem' ? t('feedback.problemLabel') : t('feedback.ideaLabel')}
            <textarea rows={5} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} autoFocus />
          </label>
          <p className="small muted" style={{ margin: 0 }}>{t('feedback.hint')}</p>
        </div>
      </Modal>
    </>
  );
}
