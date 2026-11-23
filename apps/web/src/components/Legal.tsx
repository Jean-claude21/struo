// Spec 060, restyled in 062: the legal pages (legal notice, privacy, cookies, terms, data processing)
// in the landing's editorial look. Content in i18n/legal.fr.ts and legal.en.ts, written by us,
// never from user input.
import { EdFooter, EdHeader } from './Editorial.tsx';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { LEGAL_MAIL, LEGAL_SLUGS, LEGAL_UPDATED, type LegalKey } from '@/i18n/legal.ts';
import { legalEn } from '@/i18n/legal.en.ts';
import { legalFr } from '@/i18n/legal.fr.ts';

const ORDER: LegalKey[] = ['notice', 'privacy', 'cookies', 'terms', 'dpa'];

/** The links to the five pages, for every public footer. */
export function LegalLinks({ current }: { current?: LegalKey }) {
  const { t } = useI18n();
  return (
    <nav className="ed-legal" aria-label={t('legal.kicker')}>
      {ORDER.map((key) => (
        <a key={key} href={`/${LEGAL_SLUGS[key]}`} aria-current={key === current ? 'page' : undefined}>{t(`legal.nav.${key}` as MessageKey)}</a>
      ))}
      <a href={`mailto:${LEGAL_MAIL}`}>{LEGAL_MAIL}</a>
    </nav>
  );
}

export function LegalPageView({ page }: { page: LegalKey }) {
  const { t, locale } = useI18n();
  const content = (locale === 'en' ? legalEn : legalFr)[page];
  const updated = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`));
  return (
    <div className="ed">
      <EdHeader base="/" />
      <main>
        <section className="ed-doc-hero">
          <p className="ed-kicker ed-light"><span /> {t('legal.kicker')}</p>
          <h1>{content.title}</h1>
          <p className="ed-doc-lead">{content.lead}</p>
          <p className="ed-doc-meta">{t('legal.updated', { date: updated })}</p>
          <nav className="ed-doc-tabs" aria-label={t('legal.kicker')}>
            {ORDER.map((key) => (
              <a key={key} href={`/${LEGAL_SLUGS[key]}`} aria-current={key === page ? 'page' : undefined}>{t(`legal.nav.${key}` as MessageKey)}</a>
            ))}
          </nav>
        </section>
        <div className="ed-doc">
          <nav className="ed-toc" aria-label={t('legal.toc')}>
            <b>{t('legal.toc')}</b>
            <ol>{content.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a></li>)}</ol>
          </nav>
          <article className="ed-prose">
            {content.summary.length ? (
              <div className="ed-summary"><ul>{content.summary.map((item) => <li key={item} dangerouslySetInnerHTML={{ __html: item }} />)}</ul></div>
            ) : null}
            {content.sections.map((section) => (
              <section key={section.id}>
                <h2 id={section.id}>{section.title}</h2>
                <div dangerouslySetInnerHTML={{ __html: section.html }} />
              </section>
            ))}
            <div className="ed-contact-box">
              <b>{t('legal.contactTitle')}</b>
              <p>{t('legal.contactText')} <a href={`mailto:${LEGAL_MAIL}`}>{LEGAL_MAIL}</a></p>
            </div>
          </article>
        </div>
      </main>
      <EdFooter current={page} />
    </div>
  );
}
