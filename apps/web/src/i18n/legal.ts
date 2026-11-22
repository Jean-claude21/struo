// Spec 060: the shape of the legal pages, shared by legal.fr.ts and legal.en.ts.
export type LegalKey = 'notice' | 'privacy' | 'cookies' | 'terms' | 'dpa';

export interface LegalPage {
  slug: string;
  title: string;
  lead: string;
  /** The few points that matter most, shown first (may be empty). */
  summary: string[];
  sections: { id: string; title: string; html: string }[];
}

export type LegalPages = Record<LegalKey, LegalPage>;

/** The public paths of the pages (French slugs in both languages). */
export const LEGAL_SLUGS: Record<LegalKey, string> = {
  notice: 'mentions-legales', privacy: 'confidentialite', cookies: 'cookies', terms: 'conditions', dpa: 'traitement-donnees',
};

/** The date shown on every page; change it with the content. */
export const LEGAL_UPDATED = '2026-11-22';

export const LEGAL_MAIL = 'contact@kete.digital';
