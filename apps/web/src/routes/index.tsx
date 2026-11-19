import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { Mascot } from '@/components/Mascot.tsx';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { getPlans } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');

function Landing() {
  const { t, locale } = useI18n();
  const { plans } = Route.useLoaderData();
  const { viewer } = root.useLoaderData();
  const features = [1, 2, 3, 4, 5, 6] as const;
  return (
    <div className="public">
      <PublicHeader signedIn={Boolean(viewer)} />
      <section className="hero">
        <Mascot size={150} />
        <h1>{t('landing.heroTitle')}</h1>
        <p>{t('landing.heroSub')}</p>
        <div className="row">
          <Link to="/login" className="btn secondary">
            {t('landing.signIn')}
          </Link>
          <Link to="/signup" className="btn">
            {t('landing.trial')}
          </Link>
        </div>
        <div className="row" style={{ marginTop: '1.25rem' }}>
          <span className="badge info">{t('landing.badgeOffline')}</span>
          <span className="badge info">{t('landing.badgeMobileMoney')}</span>
          <span className="badge info">{t('landing.badgeMcp')}</span>
        </div>
      </section>
      <section>
        <h2 style={{ textAlign: 'center' }}>{t('landing.featuresTitle')}</h2>
        <div className="grid" style={{ marginTop: '1rem' }}>
          {features.map((n) => (
            <div key={n} className="card">
              <h3>{t(`landing.f${n}Title`)}</h3>
              <p className="muted">{t(`landing.f${n}Body`)}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginTop: '2.5rem' }} id="pricing">
        <h2 style={{ textAlign: 'center' }}>{t('landing.pricingTitle')}</h2>
        <p className="muted small" style={{ textAlign: 'center' }}>
          {t('landing.pricingNote')}
        </p>
        <div className="grid">
          {plans
            .filter((plan) => plan.code !== 'trial')
            .map((plan) => (
              <div key={plan.code} className={`card price-card ${plan.code === 'pro' ? 'featured' : ''}`}>
                <h3>{plan.name}</h3>
                <div className="price">
                  {plan.priceMinor > 0 ? (
                    <>
                      {formatMoney(locale, plan.priceMinor, plan.currencyCode)} <span className="muted small">{t('landing.perMonth')}</span>
                    </>
                  ) : (
                    t('landing.onQuote')
                  )}
                </div>
                <ul>
                  <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                </ul>
                <Link to="/signup" className={`btn block ${plan.code === 'pro' ? '' : 'secondary'}`}>
                  {t('landing.choose')}
                </Link>
              </div>
            ))}
        </div>
      </section>
      <footer className="muted small" style={{ textAlign: 'center', marginTop: '3rem' }}>
        {t('landing.footer', { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}
