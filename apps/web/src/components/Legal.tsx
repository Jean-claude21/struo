// Spec 060: the legal pages (legal notice, privacy, cookies, terms, data processing), one layout,
// the content in i18n/legal.fr.ts and legal.en.ts. Written by us, never from user input.
import { getRouteApi, Link } from '@tanstack/react-router';
import { Logo, PublicHeader } from './PublicHeader.tsx';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { LEGAL_MAIL, LEGAL_SLUGS, LEGAL_UPDATED, type LegalKey } from '@/i18n/legal.ts';
import { legalEn } from '@/i18n/legal.en.ts';
import { legalFr } from '@/i18n/legal.fr.ts';

const root = getRouteApi('__root__');
const ORDER: LegalKey[] = ['notice', 'privacy', 'cookies', 'terms', 'dpa'];

/** The links to the five pages, for every public footer. */
export function LegalLinks({ current }: { current?: LegalKey }) {
  const { t } = useI18n();
  return (
    <nav className="lp-legal" aria-label={t('legal.kicker')}>
      {ORDER.map((key) => (
        <a key={key} href={`/${LEGAL_SLUGS[key]}`} aria-current={key === current ? 'page' : undefined}>{t(`legal.nav.${key}` as MessageKey)}</a>
      ))}
      <a href={`mailto:${LEGAL_MAIL}`}>{LEGAL_MAIL}</a>
    </nav>
  );
}

export function LegalPageView({ page }: { page: LegalKey }) {
  const { t, locale } = useI18n();
  const { viewer } = root.useLoaderData();
  const content = (locale === 'en' ? legalEn : legalFr)[page];
  const updated = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`));
  return (
    <div className="lx lp">
      <div className="lx-top"><div className="lx-wrap"><PublicHeader signedIn={Boolean(viewer)} cta={{ href: '/#rappel', label: t('lp.cta') }} /></div></div>
      <section className="lp-hero lp-doc-hero">
        <div className="lx-wrap">
          <p className="lp-kicker">{t('legal.kicker')}</p>
          <h1>{content.title}</h1>
          <p className="lp-lead">{content.lead}</p>
          <p className="lp-doc-meta">{t('legal.updated', { date: updated })}</p>
        </div>
      </section>
      <div className="lx-wrap lp-doc">
        <nav className="lp-toc" aria-label={t('legal.toc')}>
          <b>{t('legal.toc')}</b>
          <ol>{content.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
        </nav>
        <article className="lp-prose">
          {content.summary.length ? (
            <div className="lp-summary"><ul>{content.summary.map((item) => <li key={item} dangerouslySetInnerHTML={{ __html: item }} />)}</ul></div>
          ) : null}
          {content.sections.map((section) => (
            <section key={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <div dangerouslySetInnerHTML={{ __html: section.html }} />
            </section>
          ))}
          <div className="lp-contact-box">
            <b>{t('legal.contactTitle')}</b>
            <p>{t('legal.contactText')} <a href={`mailto:${LEGAL_MAIL}`}>{LEGAL_MAIL}</a></p>
          </div>
        </article>
      </div>
      <footer className="lx-wrap lp-footer">
        <Logo />
        <span className="lp-sign">{t('app.tagline')}</span>
        <span>{t('legal.by')}</span>
        <Link to="/">Struo</Link>
        <LegalLinks current={page} />
      </footer>
    </div>
  );
}
