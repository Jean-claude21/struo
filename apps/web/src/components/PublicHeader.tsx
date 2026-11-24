import { ArrowRight } from 'lucide-react';
import { BrandMark } from './BrandMark.tsx';
import { Link, useRouter } from '@tanstack/react-router';
import { setLocale } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export function Logo() {
  return (
    <span className="logo" style={{ padding: 0 }}>
      <BrandMark size={26} />
      <span>struo</span>
    </span>
  );
}

export function LanguageSwitch() {
  const { locale, t } = useI18n();
  const router = useRouter();
  return (
    <select
      aria-label={t('app.language')}
      className="lang-pill"
      value={locale}
      onChange={async (event) => {
        await setLocale({ data: { locale: event.target.value } });
        await router.invalidate();
      }}
    >
      <option value="fr">🇫🇷 FR</option>
      <option value="en">🇬🇧 EN</option>
    </select>
  );
}

/** The public header: logo, the page's own links (landing), language, sign-in and the demo. */
export function PublicHeader({ signedIn, nav, cta }: { signedIn?: boolean; nav?: { href: string; label: string }[]; cta?: { href: string; label: string } }) {
  const { t } = useI18n();
  return (
    <header className="public-header">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Struo">
        <Logo />
      </Link>
      {nav?.length ? <nav className="public-nav" aria-label={t('lx.nav.label')}>{nav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav> : null}
      <div className="public-actions">
        <LanguageSwitch />
        {signedIn ? (
          <Link to="/app" className="btn small dark">{t('nav.dashboard')}</Link>
        ) : (
          <>
            <Link to="/login" className="public-login">{t('landing.signIn')}</Link>
            {cta
              ? <a href={cta.href} className="btn small dark" data-umami-event="lp-call-nav">{cta.label}<ArrowRight size={15} /></a>
              : <Link to="/demo" className="btn small dark" data-umami-event="lp-demo-nav">{t('lx.nav.demo')}<ArrowRight size={15} /></Link>}
          </>
        )}
      </div>
    </header>
  );
}
