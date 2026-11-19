import { actorFromApiKey, DomainError, ensure, listCompanies, resolveActor, type Actor, type Door, type Permission } from '@struo/core';
import { ORG_COOKIE } from './context.server.ts';
import { runtime } from './runtime.server.ts';

const cookieValue = (header: string | null, name: string) =>
  header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/**
 * The acting member of an HTTP request: a bearer key (API, MCP) or the session cookie (the field
 * app, file downloads). Refusals are DomainErrors (401/403).
 */
export async function actorFromRequest(request: Request, door: Door, permission?: Permission): Promise<Actor> {
  const { db, auth } = runtime();
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim();
  let actor: Actor | null = null;
  if (bearer) {
    actor = await actorFromApiKey(db, bearer, door === 'mcp' ? 'mcp' : 'api');
    if (!actor) throw new DomainError('not_signed_in', 401);
  } else {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new DomainError('not_signed_in', 401);
    const companies = await listCompanies(db, session.user.id);
    const chosen = cookieValue(request.headers.get('cookie'), ORG_COOKIE);
    const company = companies.find((candidate) => candidate.id === chosen) ?? companies[0];
    if (!company) throw new DomainError('no_company', 403);
    actor = await resolveActor(db, session.user.id, company.id, door);
    if (!actor) throw new DomainError('no_company', 403);
  }
  if (permission) ensure(actor, permission);
  return actor;
}

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_DOCUMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/** Serves a stored file with safe headers (never executed by the browser). */
export async function serveFile(key: string, mediaType: string, filename?: string): Promise<Response> {
  const file = await runtime().storage.get(key);
  if (!file) return Response.json({ error: 'not_found' }, { status: 404 });
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'content-type': mediaType || file.mediaType,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      ...(filename ? { 'content-disposition': `inline; filename="${filename.replace(/[^\w.-]/gu, '_')}"` } : {}),
    },
  });
}
