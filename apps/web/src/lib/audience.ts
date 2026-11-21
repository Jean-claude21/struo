// Audience analytics (spec 041, made safe in spec 055): Umami counts only the public pages, by their
// path alone (never a query string, never a client-space or invitation link), plus a few named
// successes. Nothing is sent when Umami is not configured (staging, local).
type Umami = { track: (payload?: unknown, data?: Record<string, unknown>) => void };
const umami = () => (typeof window === 'undefined' ? undefined : (window as unknown as { umami?: Umami }).umami);

/** The pages counted: what a prospect sees before having an account. */
export const PUBLIC_PATHS = new Set(['/', '/demo', '/signup', '/login', '/forgot-password', '/onboarding']);

export function trackPage(path: string): void {
  if (!PUBLIC_PATHS.has(path)) return;
  umami()?.track((props: Record<string, unknown>) => ({ ...props, url: path, referrer: '' }));
}

/** A success worth counting: « signup-done », « company-created », « contact-sent ». */
export function trackSuccess(name: 'signup-done' | 'company-created' | 'contact-sent'): void {
  umami()?.track(name);
}
