import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Mascot } from '@/components/Mascot.tsx';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

// Keeps the OAuth request of an assistant (client_id, sig…) next to `next`, untouched.
export const nextSearch = (search: Record<string, unknown>): { next?: string } & Record<string, string | undefined> => ({
  ...Object.fromEntries(Object.entries(search).filter(([, value]) => typeof value === 'string')),
  next: typeof search.next === 'string' && search.next.startsWith('/') && !search.next.startsWith('//') ? search.next : undefined,
});

/**
 * Signs in or up. During an assistant's OAuth flow (the page was opened with its client_id), the
 * request goes along and the accounts library answers with where to go next (the consent page).
 */
export async function authenticate(kind: 'sign-in' | 'sign-up', body: Record<string, string>): Promise<{ ok: boolean; url?: string; code?: string }> {
  const query = window.location.search.slice(1);
  const oauth = new URLSearchParams(query).has('client_id');
  const response = await fetch(`/api/auth/${kind}/email`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(oauth ? { ...body, oauth_query: query } : body),
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; code?: string };
  return { ok: response.ok, url: data.url, code: response.ok ? undefined : data.code ?? (response.status === 429 ? 'TOO_MANY_REQUESTS' : undefined) };
}

export const Route = createFileRoute('/login')({ validateSearch: nextSearch, component: Login });

function Login() {
  const { t } = useI18n();
  const { next } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
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
            const result = await authenticate('sign-in', { email: String(form.get('email')), password: String(form.get('password')) });
            setBusy(false);
            if (!result.ok) setError(result.code === 'TOO_MANY_REQUESTS' ? t('account.err.tooMany') : t('errors.sign_in_failed'));
            else window.location.href = result.url ?? next ?? '/app';
          }}
        >
          <Field label={t('app.email')}>
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label={t('auth.password')}>
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Link to="/forgot-password" search={email ? { email } : {}} className="small" style={{ alignSelf: 'flex-end', marginTop: '-.4rem' }}>{t('account.forgot.link')}</Link>
          <ErrorText error={error} />
          <div className="pair">
            <Link to="/signup" search={Route.useSearch()} className="btn secondary">
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
