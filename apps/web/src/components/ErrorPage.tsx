// The page shown when something breaks (spec 041): it says so plainly, reports the error, gives a
// short code to quote to support, and offers to retry or go back. Never a raw stack or a blank page.
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { reportClientError } from '@/lib/monitor.ts';
import { useI18n } from '@/i18n/index.tsx';

/** Errors the application already explains (not signed in, not found…) are not bugs. */
const KNOWN = /^(not_found|not_signed_in|forbidden|no_company|company_suspended|invitation_invalid)(\||$)/u;

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const message = error instanceof Error ? error.message : String(error);
  const known = KNOWN.test(message);
  useEffect(() => {
    if (known) return;
    const id = reportClientError(error, 'page', { path: window.location.pathname });
    setCode((id ?? Math.random().toString(16).slice(2)).slice(0, 8).toUpperCase());
  }, [error, known]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div className="public" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh', padding: '2rem 1rem' }}>
      <div className="card stack" style={{ maxWidth: 460, textAlign: 'center', padding: '2rem 1.5rem' }}>
        <TriangleAlert size={40} style={{ margin: '0 auto', color: 'var(--warn)' }} />
        <h1 style={{ fontSize: '1.5rem' }}>{offline ? t('errorPage.offlineTitle') : known && message.startsWith('not_found') ? t('errorPage.notFoundTitle') : t('errorPage.title')}</h1>
        <p className="muted">{offline ? t('errorPage.offlineBody') : known ? t(`errors.${message.split('|')[0]}` as never) : t('errorPage.body')}</p>
        {code && !offline ? <p className="small muted">{t('errorPage.code')} <b className="mono">{code}</b></p> : null}
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '.6rem' }}>
          <button type="button" className="btn" onClick={() => { reset(); void router.invalidate(); }}><RotateCcw size={16} />{t('errorPage.retry')}</button>
          <a className="btn secondary" href="/app">{t('errorPage.home')}</a>
        </div>
      </div>
    </div>
  );
}
