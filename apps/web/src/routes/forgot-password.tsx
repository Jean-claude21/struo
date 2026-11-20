import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { authCall, authErrorKey } from '@/features/auth/call.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/forgot-password')({
  validateSearch: (search: Record<string, unknown>): { email?: string } => (typeof search.email === 'string' ? { email: search.email } : {}),
  component: ForgotPassword,
});

/**
 * Forgotten password (spec 040): the person types the address, receives a one-hour link. The page
 * answers the same whether or not the address has an account, so nobody can probe who is a customer.
 */
function ForgotPassword() {
  const { t } = useI18n();
  const { email: initial } = Route.useSearch();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="public">
      <PublicHeader />
      <div className="auth-box card">
        {sent ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <MailCheck size={44} style={{ margin: '0 auto', color: 'var(--ok, #1f8a55)' }} />
            <h1>{t('account.forgot.sentTitle')}</h1>
            <p className="muted">{t('account.forgot.sentBody', { email: sent })}</p>
            <p className="muted small">{t('account.forgot.sentHelp')}</p>
            <button type="button" className="btn secondary" onClick={() => setSent(null)}>{t('account.forgot.again')}</button>
            <Link to="/login" className="btn ghost">{t('account.backToLogin')}</Link>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              const email = String(new FormData(event.currentTarget).get('email')).trim();
              setBusy(true); setError(null);
              const result = await authCall('/request-password-reset', { email, redirectTo: '/reset-password' });
              setBusy(false);
              if (result.ok) setSent(email);
              else setError(t(authErrorKey(result.code) as MessageKey));
            }}
          >
            <h1>{t('account.forgot.title')}</h1>
            <p className="muted">{t('account.forgot.intro')}</p>
            <Field label={t('app.email')}>
              <input name="email" type="email" autoComplete="email" required defaultValue={initial ?? ''} autoFocus />
            </Field>
            <ErrorText error={error} />
            <button className="btn block" disabled={busy}>{busy ? t('account.sending') : t('account.forgot.submit')}</button>
            <Link to="/login" className="btn ghost block">{t('account.backToLogin')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
