import { createFileRoute, redirect } from '@tanstack/react-router';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field, formData, useAction } from '@/components/ui.tsx';
import { createCompany } from '@/features/settings/server.ts';
import { getShell, selectCompany } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/onboarding')({
  loader: async () => {
    const { viewer } = await getShell();
    if (!viewer) throw redirect({ to: '/login', search: { next: '/onboarding' } });
    return { viewer };
  },
  component: Onboarding,
});

function Onboarding() {
  const { t, locale } = useI18n();
  const { viewer } = Route.useLoaderData();
  const { run, error, busy } = useAction();
  return (
    <div className="public">
      <PublicHeader signedIn />
      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>{t('onboarding.title')}</h1>
        <p className="muted">{t('onboarding.subtitle')}</p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const done = await run(
              () =>
                createCompany({
                  data: {
                    name: v.name,
                    countryCode: v.countryCode?.toUpperCase(),
                    currencyCode: v.currencyCode?.toUpperCase(),
                    vatBps: Math.round(Number(v.vat?.replace(',', '.')) * 100),
                    retentionBps: Math.round(Number(v.retention?.replace(',', '.')) * 100),
                    locale: v.locale,
                  },
                }),
              { reload: false },
            );
            if (done) window.location.href = '/app';
          }}
        >
          <Field label={t('onboarding.companyName')}>
            <input name="name" required minLength={2} />
          </Field>
          <div className="form-grid">
            <Field label={t('onboarding.country')}>
              <input name="countryCode" defaultValue="TG" maxLength={2} required pattern="[A-Za-z]{2}" />
            </Field>
            <Field label={t('onboarding.currency')}>
              <input name="currencyCode" defaultValue="XOF" maxLength={3} required pattern="[A-Za-z]{3}" />
            </Field>
            <Field label={t('onboarding.vat')}>
              <input name="vat" defaultValue="18" inputMode="decimal" required />
            </Field>
            <Field label={t('onboarding.retention')}>
              <input name="retention" defaultValue="5" inputMode="decimal" required />
            </Field>
            <Field label={t('onboarding.locale')}>
              <select name="locale" defaultValue={locale}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <p className="notice info small">{t('onboarding.defaultsNote')}</p>
          <ErrorText error={error} />
          <button className="btn" disabled={busy}>
            {t('onboarding.submit')}
          </button>
        </form>
      </div>
      {viewer.companies.length > 0 ? (
        <div className="card" style={{ maxWidth: 720, margin: '1rem auto' }}>
          <h2>{t('onboarding.yourCompanies')}</h2>
          {viewer.companies.map((company) => (
            <div key={company.id} className="row" style={{ justifyContent: 'space-between', padding: '.4rem 0' }}>
              <span>
                {company.name} <span className="muted small">— {t(`roles.${company.role}`)}</span>
              </span>
              <button
                type="button"
                className="btn secondary small"
                onClick={async () => {
                  await selectCompany({ data: { orgId: company.id } });
                  window.location.href = '/app';
                }}
              >
                {t('onboarding.switchTo')}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
