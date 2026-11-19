import {
  DomainError, ensure, listCompanies, resolveActor, type Actor, type Door, type Permission, type Role,
} from '@struo/core';
import { getCookie, getRequestHeaders, setCookie } from '@tanstack/react-start/server';
import { isLocale, LOCALE_COOKIE, localeFromHeaders, type Locale } from '@/i18n/index.tsx';
import { runtime } from './runtime.server.ts';

export const ORG_COOKIE = 'struo_org';

export interface Viewer {
  userId: string;
  name: string;
  email: string;
  companies: { id: string; name: string; role: Role }[];
  /** The company being worked on (cookie, else the first one). */
  company: { id: string; name: string; role: Role } | null;
  platformAdmin: boolean;
}

/** The signed-in person, from the session cookie of the current request. */
export async function loadViewer(): Promise<Viewer | null> {
  const { auth, db, env } = runtime();
  const session = await auth.api.getSession({ headers: getRequestHeaders() as unknown as Headers });
  if (!session) return null;
  const companies = await listCompanies(db, session.user.id);
  const chosen = getCookie(ORG_COOKIE);
  const company = companies.find((candidate) => candidate.id === chosen) ?? companies[0] ?? null;
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    companies,
    company,
    platformAdmin: env.PLATFORM_ADMIN_EMAILS.includes(session.user.email.toLowerCase()),
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

export function requestLocale(): Locale {
  const chosen = getCookie(LOCALE_COOKIE);
  if (isLocale(chosen)) return chosen;
  const headers = getRequestHeaders() as unknown as Record<string, string | undefined>;
  return localeFromHeaders(null, headers['accept-language'] ?? null);
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
  console.error('[server]', error);
  return new Error('generic');
}

/** JSON response for the REST and file routes, with the same error mapping. */
export function jsonError(error: unknown): Response {
  if (isMalformedId(error)) return Response.json({ error: 'not_found', params: {} }, { status: 404 });
  if (error instanceof DomainError) return Response.json({ error: error.code, params: error.params }, { status: error.status });
  console.error('[api]', error);
  return Response.json({ error: 'generic' }, { status: 500 });
}
