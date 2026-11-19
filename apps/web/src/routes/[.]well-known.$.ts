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
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return auth.handler(request);
  const path = url.pathname.replace(/\/(api\/auth|mcp)$/u, '');
  url.pathname = `/api/auth${path}`;
  return auth.handler(new Request(url, { method: 'GET', headers: request.headers }));
}

export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: ({ request }) => discovery(request) } },
});
