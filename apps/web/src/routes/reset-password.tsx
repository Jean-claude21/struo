import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { authCall, authErrorKey } from '@/features/auth/call.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    ...(typeof search.token === 'string' ? { token: search.token } : {}),
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  component: ResetPassword,
});

/** Choosing a new password from the e-mailed link (spec 040). Every open session is closed. */
function ResetPassword() {
  const { t } = useI18n();
  const { token, error: linkError } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const invalid = !token || Boolean(linkError);
  return (
    <div className="public">
      <PublicHeader />
      <div className="auth-box card">
        {done ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <CheckCircle2 size={44} style={{ margin: '0 auto', color: 'var(--ok, #1f8a55)' }} />
            <h1>{t('account.reset.doneTitle')}</h1>
            <p className="muted">{t('account.reset.doneBody')}</p>
            <Link to="/login" className="btn block">{t('auth.signIn')}</Link>
          </div>
        ) : invalid ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <h1>{t('account.reset.expiredTitle')}</h1>
            <p className="muted">{t('account.reset.expiredBody')}</p>
            <Link to="/forgot-password" className="btn block">{t('account.reset.askAgain')}</Link>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const password = String(form.get('password'));
              if (password !== String(form.get('confirm'))) { setError(t('account.err.mismatch')); return; }
              setBusy(true); setError(null);
              const result = await authCall('/reset-password', { newPassword: password, token });
              setBusy(false);
              if (result.ok) setDone(true);
              else setError(t(authErrorKey(result.code) as MessageKey));
            }}
          >
            <h1>{t('account.reset.title')}</h1>
            <p className="muted">{t('account.reset.intro')}</p>
            <Field label={t('account.newPassword')} hint={t('auth.passwordHint')}>
              <div className="row tight">
                <input name="password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} autoFocus style={{ flex: 1 }} />
                <button type="button" className="btn ghost small" aria-label={t(show ? 'account.hide' : 'account.show')} onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </Field>
            <Field label={t('account.confirmPassword')}>
              <input name="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} />
            </Field>
            <ErrorText error={error} />
            <button className="btn block" disabled={busy}>{t('account.reset.submit')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
