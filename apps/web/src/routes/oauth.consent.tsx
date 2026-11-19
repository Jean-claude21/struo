import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field, useAction } from '@/components/ui.tsx';
import { getConsent, grantMcpCompany } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

/**
 * The consent page of the OAuth flow (spec 016): which company this assistant may reach, then the
 * accounts library is told « yes » or « no » and sends the person back to the assistant.
 */
export const Route = createFileRoute('/oauth/consent')({
  // Rendered in the browser: the signed request must be read exactly as the address carries it
  // (repeated parameters included), never re-serialized by the router.
  ssr: false,
  loader: async () => {
    const raw = window.location.search;
    const data = await getConsent({ data: { query: raw.replace(/^\?/u, '') } });
    if (!data.signedIn) throw redirect({ href: `/login${raw}` });
    return data;
  },
  component: Consent,
});

function Consent() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { run, error, busy } = useAction();
  const [orgId, setOrgId] = useState(data.companies[0]?.id ?? '');
  const answer = async (accept: boolean) => {
    const query = window.location.search.slice(1);
    if (accept) {
      const done = await run(() => grantMcpCompany({ data: { clientId: data.clientId, orgId } }), { reload: false });
      if (!done) return;
    }
    const response = await fetch('/api/auth/oauth2/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accept, oauth_query: query }),
    });
    const body = (await response.json().catch(() => ({}))) as { url?: string; redirect_uri?: string; uri?: string };
    const next = body.url ?? body.redirect_uri ?? body.uri;
    if (next) window.location.href = next;
  };
  return (
    <div className="public">
      <PublicHeader signedIn />
      <div className="card auth-box stack">
        <h1>{t('oauth.title', { client: data.clientName })}</h1>
        {!data.valid ? (
          <p className="error">{t('oauth.invalid')}</p>
        ) : (
          <>
            <p>{t('oauth.lead', { client: data.clientName })}</p>
            <Field label={t('oauth.company')}>
              <select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
                {data.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} — {t(`roles.${company.role}`)}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted small">{t('oauth.note')}</p>
            <ErrorText error={error} />
            <div className="pair">
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void answer(false)}>
                {t('oauth.refuse')}
              </button>
              <button type="button" className="btn" disabled={busy || !orgId} onClick={() => void answer(true)}>
                {t('oauth.accept')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
