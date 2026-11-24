import { requireMcpAuth } from '@better-auth/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { platformKeyOwner, platformMcpGrant } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { createPlatformMcpServer } from '@/features/mcp/platform.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * Specs 056 and 056 bis: the founder's console through MCP (Streamable HTTP, stateless).
 * - OAuth (Claude.ai, Claude Desktop, ChatGPT…): the assistant signs the person in; on the consent
 *   page a platform admin connects it to the console, read-only or not. The token is bound to this
 *   resource (`/mcp/platform`).
 * - A platform key (`Authorization: Bearer struo_pk_…`), as a fallback for scripts and Claude Code.
 * Either way the person must still be in the platform admin list. A browser cookie never opens it.
 */
const refuse = (message: string, status = 401) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } }, { status });

async function serve(request: Request, access: { adminId: string; readOnly: boolean }): Promise<Response> {
  const server = createPlatformMcpServer(runtime(), access);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

let oauth: ((request: Request) => Promise<Response>) | undefined;

async function handle(request: Request): Promise<Response> {
  const rt = runtime();
  const isAdmin = (email: string) => rt.env.PLATFORM_ADMIN_EMAILS.includes(email.toLowerCase());
  const key = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(struo_pk_\S+)$/iu)?.[1];
  if (key) {
    const owner = await platformKeyOwner(rt.owner, key);
    if (!owner) return refuse('Invalid or revoked platform key.');
    if (!isAdmin(owner.email)) return refuse('This key’s creator is no longer a platform admin.', 403);
    return serve(request, owner);
  }
  oauth ??= requireMcpAuth(
    rt.auth,
    async (verified, claims) => {
      const userId = String(claims.sub ?? '');
      const clientId = String(claims.azp ?? claims.client_id ?? '');
      const grant = userId && clientId ? await platformMcpGrant(rt.owner, userId, clientId) : null;
      if (!grant) return refuse('This assistant is not connected to the platform console: reconnect it as a platform admin.', 403);
      if (!isAdmin(grant.email)) return refuse('This account is no longer a platform admin.', 403);
      return serve(verified, { adminId: userId, readOnly: grant.readOnly });
    },
    { resource: `${rt.env.APP_BASE_URL}/mcp/platform` },
  );
  return oauth(request);
}

export const Route = createFileRoute('/mcp_/platform')({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request), DELETE: ({ request }) => handle(request) } },
});
