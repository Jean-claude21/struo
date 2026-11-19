import { Link, useRouter } from '@tanstack/react-router';
import { setLocale } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export function Logo() {
  return (
    <span className="logo" style={{ padding: 0 }}>
      Str<span>uo</span>
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

export function PublicHeader({ signedIn }: { signedIn?: boolean }) {
  const { t } = useI18n();
  return (
    <header className="public-header">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Logo />
      </Link>
      <div className="row">
        <LanguageSwitch />
        {signedIn ? (
          <Link to="/app" className="btn small">
            {t('nav.dashboard')}
          </Link>
        ) : (
          <Link to="/login" className="btn secondary small">
            {t('landing.signIn')}
          </Link>
        )}
      </div>
    </header>
  );
}
