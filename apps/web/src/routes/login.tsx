import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Mascot } from '@/components/Mascot.tsx';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { authClient } from '@/features/auth/client.ts';
import { useI18n } from '@/i18n/index.tsx';

export const nextSearch = (search: Record<string, unknown>): { next?: string } => ({
  next: typeof search.next === 'string' && search.next.startsWith('/') && !search.next.startsWith('//') ? search.next : undefined,
});

export const Route = createFileRoute('/login')({ validateSearch: nextSearch, component: Login });

function Login() {
  const { t } = useI18n();
  const { next } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="public">
      <PublicHeader />
      <div className="auth-box card">
        <Mascot size={110} />
        <h1 style={{ textAlign: 'center' }}>{t('auth.signIn')}</h1>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError(null);
            const result = await authClient.signIn.email({ email: String(form.get('email')), password: String(form.get('password')) });
            setBusy(false);
            if (result.error) setError(t('errors.sign_in_failed'));
            else window.location.href = next ?? '/app';
          }}
        >
          <Field label={t('app.email')}>
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={t('auth.password')}>
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <ErrorText error={error} />
          <div className="pair">
            <Link to="/signup" search={{ next }} className="btn secondary">
              {t('auth.signUp')}
            </Link>
            <button className="btn" disabled={busy}>
              {t('auth.signIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
