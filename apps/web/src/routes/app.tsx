import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { authClient } from '@/features/auth/client.ts';
import { getShell, selectCompany } from '@/features/shell/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app')({
  loader: async ({ location }) => {
    const { viewer } = await getShell();
    if (!viewer) throw redirect({ to: '/login', search: { next: location.pathname } });
    if (!viewer.company) throw redirect({ to: '/onboarding' });
    return { viewer: { ...viewer, company: viewer.company } };
  },
  component: OfficeLayout,
  errorComponent: OfficeError,
});

/** A refusal or an unexpected error, in the person's language, without losing the page. */
function OfficeError({ error }: { error: unknown }) {
  const { t, errorText } = useI18n();
  return (
    <div className="public">
      <div className="card stack">
        <p className="error">{errorText(error)}</p>
        <div className="row">
          <a className="btn secondary" href="/app">
            {t('nav.dashboard')}
          </a>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('app.open')}
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV: { to: string; key: MessageKey; exact?: boolean }[] = [
  { to: '/app', key: 'nav.dashboard', exact: true },
  { to: '/app/projects', key: 'nav.projects' },
  { to: '/app/field', key: 'nav.field' },
  { to: '/app/finance', key: 'nav.finance' },
  { to: '/app/expenses', key: 'nav.expenses' },
  { to: '/app/documents', key: 'nav.documents' },
  { to: '/app/planning', key: 'nav.planning' },
  { to: '/app/clients', key: 'nav.clients' },
  { to: '/app/settings', key: 'nav.settings' },
];

function OfficeLayout() {
  const { t } = useI18n();
  const { viewer } = Route.useLoaderData();
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Struo">
        <div className="logo">
          Str<span>uo</span>
        </div>
        {viewer.companies.length > 1 ? (
          <select
            aria-label={t('settings.company')}
            value={viewer.company.id}
            onChange={async (event) => {
              await selectCompany({ data: { orgId: event.target.value } });
              window.location.href = '/app';
            }}
            style={{ marginBottom: '.5rem' }}
          >
            {viewer.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="card small" style={{ padding: '.5rem .75rem', marginBottom: '.5rem' }}>
            <strong>{viewer.company.name}</strong>
            <div className="muted">{t(`roles.${viewer.company.role}`)}</div>
          </div>
        )}
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="nav-link"
            activeProps={{ className: 'nav-link active' }}
            activeOptions={{ exact: item.exact ?? false }}
          >
            {t(item.key)}
          </Link>
        ))}
        <div className="spacer" />
        <a href="/field" className="btn secondary small">
          {t('nav.openField')}
        </a>
        {viewer.platformAdmin ? (
          <Link to="/console" className="nav-link">
            {t('nav.console')}
          </Link>
        ) : null}
        <div className="row" style={{ marginTop: '.75rem' }}>
          <LanguageSwitch />
          <button
            type="button"
            className="btn ghost small"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = '/';
            }}
          >
            {t('app.signOut')}
          </button>
        </div>
        <p className="muted small">{viewer.name}</p>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
