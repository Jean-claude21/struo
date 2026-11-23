import {
  DomainError, ensure, listCompanies, resolveActor, type Actor, type Door, type Permission, type Role,
} from '@struo/core';
import { getCookie, getRequestHeaders, setCookie } from '@tanstack/react-start/server';
import { isLocale, LOCALE_COOKIE, localeFromHeaders, type Locale } from '@/i18n/index.tsx';
import { COUNTRY_COOKIE, countryFromLanguages, DEFAULT_COUNTRY, isCountry } from '@/features/settings/countries.ts';
import { reportError } from './monitor.server.ts';
import { runtime } from './runtime.server.ts';

export const ORG_COOKIE = 'struo_org';

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  /** Whether the address was confirmed from the e-mailed link (spec 040). */
  emailVerified: boolean;
  companies: { id: string; name: string; role: Role }[];
  /** The company being worked on (cookie, else the first one). */
  company: { id: string; name: string; role: Role } | null;
  platformAdmin: boolean;
  /** A demonstration company (spec 042): when the visitor's copy expires, null for the seeded demo. */
  demo: { expiresAt: string | null } | null;
}

/** The signed-in person, from the session cookie of the current request. */
export async function loadViewer(): Promise<Viewer | null> {
  const { auth, db, env } = runtime();
  const session = await auth.api.getSession({ headers: getRequestHeaders() as unknown as Headers });
  if (!session) return null;
  const companies = await listCompanies(db, session.user.id);
  const chosen = getCookie(ORG_COOKIE);
  const company = companies.find((candidate) => candidate.id === chosen) ?? companies[0] ?? null;
  const demoRow = company
    ? (await runtime().owner.query<{ demo: boolean; expires: string | null }>(
        'select s.is_demo as demo, d.expires_at as expires from org_settings s left join demo_sandbox d on d.org_id = s.org_id where s.org_id = $1', [company.id])).rows[0]
    : undefined;
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: Boolean(session.user.emailVerified),
    companies,
    company,
    platformAdmin: env.PLATFORM_ADMIN_EMAILS.includes(session.user.email.toLowerCase()),
    demo: demoRow?.demo ? { expiresAt: demoRow.expires ? new Date(demoRow.expires).toISOString() : null } : null,
  };
}

export function chooseCompany(orgId: string) {
  setCookie(ORG_COOKIE, orgId, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, secure: runtime().env.APP_BASE_URL.startsWith('https://') });
}

/** The acting member for this request; refuses when signed out, without company or permission. */
export async function requireActor(permission?: Permission, door: Door = 'web'): Promise<Actor> {
  const viewer = await loadViewer();
  if (!viewer) throw new DomainError('not_signed_in', 401);
  if (!viewer.company) throw new DomainError('no_company', 403);
  const actor = await resolveActor(runtime().db, viewer.userId, viewer.company.id, door);
  if (!actor) throw new DomainError('no_company', 403);
  if (permission) ensure(actor, permission);
  return actor;
}

export async function requirePlatformAdmin(): Promise<Viewer> {
  const viewer = await loadViewer();
  if (!viewer?.platformAdmin) throw new DomainError('forbidden', 403);
  return viewer;
}

/**
 * The request's headers as a plain lower-case map. The runtime hands a `Headers` object: indexing it
 * like a record silently returned nothing, so language and country were never read from the browser.
 */
function requestHeaders(): Record<string, string | undefined> {
  const raw = getRequestHeaders() as unknown;
  if (raw && typeof (raw as Headers).get === 'function' && typeof (raw as Headers).forEach === 'function') {
    const map: Record<string, string> = {};
    (raw as Headers).forEach((value, key) => { map[key.toLowerCase()] = value; });
    return map;
  }
  return Object.fromEntries(Object.entries((raw ?? {}) as Record<string, string | undefined>).map(([key, value]) => [key.toLowerCase(), value]));
}

export function requestLocale(): Locale {
  const chosen = getCookie(LOCALE_COOKIE);
  if (isLocale(chosen)) return chosen;
  const headers = requestHeaders();
  return localeFromHeaders(null, headers['accept-language'] ?? null);
}

/**
 * The visitor's country for public prices (spec 045): the country they picked (cookie), else the
 * country a proxy or CDN in front of the app tells us, else the region of their browser's language,
 * else the default. Only used to choose a currency, never stored.
 */
export function requestCountry(): { country: string; detected: boolean } {
  const chosen = getCookie(COUNTRY_COOKIE)?.toUpperCase();
  if (isCountry(chosen)) return { country: chosen, detected: true };
  const headers = requestHeaders();
  for (const name of ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country', 'x-country-code']) {
    const value = headers[name]?.toUpperCase();
    if (isCountry(value)) return { country: value, detected: true };
  }
  const fromLanguage = countryFromLanguages(headers['accept-language']);
  return fromLanguage ? { country: fromLanguage, detected: true } : { country: DEFAULT_COUNTRY, detected: false };
}

/**
 * Runs a server function body and turns a refusal into an error the browser can translate:
 * its message is `code|{params}`. Unexpected errors are logged and hidden.
 */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toClientError(error);
  }
}

/** A malformed id reaching PostgreSQL (invalid uuid) is a « not found », not a server error. */
const isMalformedId = (error: unknown) => (error as { code?: string } | null)?.code === '22P02';

export function toClientError(error: unknown): Error {
  if (isMalformedId(error)) return new Error('not_found');
  if (error instanceof DomainError) {
    return new Error(Object.keys(error.params).length ? `${error.code}|${JSON.stringify(error.params)}` : error.code);
  }
  if (error instanceof Error && /^[a-z_]+(\|.*)?$/u.test(error.message)) return error;
  reportError(error, { where: 'server-fn' });
  return new Error('generic');
}

/** JSON response for the REST and file routes, with the same error mapping. */
export function jsonError(error: unknown): Response {
  if (isMalformedId(error)) return Response.json({ error: 'not_found', params: {} }, { status: 404 });
  if (error instanceof DomainError) return Response.json({ error: error.code, params: error.params }, { status: error.status });
  reportError(error, { where: 'api' });
  return Response.json({ error: 'generic' }, { status: 500 });
}
