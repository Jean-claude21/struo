// Spec 061/062: the header and footer of the editorial look, shared by the landing and the legal
// pages (styles under `.ed` in styles.css).
import { getRouteApi, Link } from '@tanstack/react-router';
import { BrandMark } from './BrandMark.tsx';
import { LanguageSwitch } from './PublicHeader.tsx';
import { LegalLinks } from './Legal.tsx';
import { useI18n } from '@/i18n/index.tsx';
import type { LegalKey } from '@/i18n/legal.ts';

const root = getRouteApi('__root__');

/** `base` is '' on the landing (anchors of the page) and '/' elsewhere (back to the landing). */
export function EdHeader({ base = '' }: { base?: string }) {
  const { t } = useI18n();
  const { viewer } = root.useLoaderData();
  return (
    <header className="ed-nav" id="top">
      <a className="ed-brand" href={base ? '/' : '#top'} aria-label={t('lp.home')}><BrandMark size={30} onDark /><strong>struo</strong></a>
      <nav aria-label={t('lp.navLabel')}>
        <a href={`${base}#probleme`}>{t('lp.nav.problem')}</a>
        <a href={`${base}#systeme`}>{t('lp.nav.system')}</a>
        <a href={`${base}#preuve`}>{t('lp.nav.proof')}</a>
        <a href={`${base}#tarifs`}>{t('lp.nav.pricing')}</a>
      </nav>
      {viewer
        ? <Link className="ed-nav-cta" to="/app">{t('nav.dashboard')} <span>↗</span></Link>
        : <a className="ed-nav-cta" href={`${base}#rappel`} data-umami-event="lp-call-nav">{t('lp.cta')} <span>↗</span></a>}
    </header>
  );
}

export function EdFooter({ current }: { current?: LegalKey }) {
  const { t } = useI18n();
  const { viewer } = root.useLoaderData();
  return (
    <footer>
      <a className="ed-brand" href="/"><BrandMark size={30} /><strong>struo</strong></a>
      <p>{t('lp.footer.tagline')}</p>
      <div className="ed-foot-links">
        <LegalLinks current={current} />
        {viewer ? null : <Link to="/login">{t('landing.signIn')}</Link>}
        <LanguageSwitch />
      </div>
      <a href="#top">{t('lp.footer.top')}</a>
    </footer>
  );
}
