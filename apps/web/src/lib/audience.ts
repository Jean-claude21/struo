// Audience analytics (spec 041, made safe in spec 055, completed in spec 075): Umami counts only the
// public pages, by their path (never a client-space or invitation link), with where the visitor came
// from — the other site's address alone, never its path — and the campaign parameters of the link
// (utm_*), plus named events. Nothing is sent when Umami is not configured (staging, local).
type Umami = { track: (payload?: unknown, data?: Record<string, unknown>) => void };
const umami = () => (typeof window === 'undefined' ? undefined : (window as unknown as { umami?: Umami }).umami);

/** The pages counted: what a prospect sees before having an account. */
export const PUBLIC_PATHS = new Set(['/', '/demo', '/signup', '/login', '/forgot-password', '/onboarding', '/mentions-legales', '/confidentialite', '/cookies', '/conditions', '/traitement-donnees']);

/** Only these parameters of the address are kept: they name a campaign, never a person. */
const CAMPAIGN = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];

/** The other site the visitor came from (its origin only), or nothing for a visit from Struo itself. */
export function referrerOrigin(referrer: string, here: string): string {
  try {
    const from = new URL(referrer);
    return from.host === new URL(here).host ? '' : from.origin;
  } catch {
    return '';
  }
}

/** The path with the campaign parameters alone (`/?utm_source=whatsapp`), nothing else. */
export function campaignUrl(path: string, search: string): string {
  const kept = new URLSearchParams();
  const given = new URLSearchParams(search);
  for (const name of CAMPAIGN) {
    const value = given.get(name);
    if (value) kept.set(name, value.slice(0, 100));
  }
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}

export function trackPage(path: string): void {
  if (!PUBLIC_PATHS.has(path)) return;
  const url = campaignUrl(path, window.location.search);
  const referrer = referrerOrigin(document.referrer, window.location.href);
  umami()?.track((props: Record<string, unknown>) => ({ ...props, url, referrer }));
}

/** A success worth counting: « signup-done », « company-created », « contact-sent ». */
export function trackSuccess(name: 'signup-done' | 'company-created' | 'contact-sent'): void {
  umami()?.track(name);
}

/** Spec 075: a named moment on the public pages (no personal data in `data`). */
export type AudienceEvent = 'lp-country' | 'lp-calc-used' | 'lp-pricing-seen' | 'lp-proof-seen' | 'contact-error';
export function trackEvent(name: AudienceEvent, data?: Record<string, string | number>): void {
  umami()?.track(name, data);
}
