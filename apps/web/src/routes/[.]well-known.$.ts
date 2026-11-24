import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

/**
 * OAuth discovery for MCP clients (spec 016). The protected resource's metadata (RFC 9728) is
 * answered by the accounts library as it is; the authorization server's (RFC 8414, path-inserted)
 * and OpenID configuration are answered by the same handler under /api/auth.
 */
async function discovery(request: Request): Promise<Response> {
  const { auth } = runtime();
  const url = new URL(request.url);
  // Spec 056 bis: the platform console's own resource metadata (same authorization server).
  if (url.pathname === '/.well-known/oauth-protected-resource/mcp/platform') {
    const base = new URL('/.well-known/oauth-protected-resource', url);
    const response = await auth.handler(new Request(base, { method: 'GET', headers: request.headers }));
    const metadata = (await response.json()) as Record<string, unknown>;
    return Response.json({ ...metadata, resource: `${runtime().env.APP_BASE_URL}/mcp/platform` }, { headers: { 'cache-control': 'no-store' } });
  }
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return auth.handler(request);
  const path = url.pathname.replace(/\/(api\/auth|mcp)$/u, '');
  url.pathname = `/api/auth${path}`;
  return auth.handler(new Request(url, { method: 'GET', headers: request.headers }));
}

export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: ({ request }) => discovery(request) } },
});
