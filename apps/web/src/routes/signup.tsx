import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Mascot } from '@/components/Mascot.tsx';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { authErrorKey } from '@/features/auth/call.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { authenticate, nextSearch } from './login.tsx';
import { trackSuccess } from '@/lib/audience.ts';

export const Route = createFileRoute('/signup')({ validateSearch: nextSearch, component: Signup });

function Signup() {
  const { t } = useI18n();
  const { next } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="public">
      <PublicHeader />
      <div className="auth-box card">
        <Mascot size={110} />
        <h1 style={{ textAlign: 'center' }}>{t('auth.welcome', { app: 'Struo' })}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          {t('auth.welcomeSub')}
        </p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError(null);
            const result = await authenticate('sign-up', {
              name: String(form.get('name')),
              email: String(form.get('email')),
              password: String(form.get('password')),
              // Where the verification link of the welcome e-mail lands (spec 040).
              callbackURL: '/app/account?verified=1',
            });
            setBusy(false);
            if (!result.ok) setError(result.code ? t(authErrorKey(result.code) as MessageKey) : t('errors.sign_up_failed'));
            else { trackSuccess('signup-done'); window.location.href = result.url ?? next ?? '/onboarding'; }
          }}
        >
          <Field label={t('auth.yourName')}>
            <input name="name" autoComplete="name" required minLength={2} />
          </Field>
          <Field label={t('app.email')}>
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
            <input name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <ErrorText error={error} />
          <div className="pair">
            <Link to="/login" search={Route.useSearch()} className="btn secondary">
              {t('auth.signIn')}
            </Link>
            <button className="btn" disabled={busy}>
              {t('auth.signUp')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
