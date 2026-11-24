import { requireMcpAuth } from '@better-auth/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { actorFromApiKey, actorFromMcpGrant, planIncludes, type Actor } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { createStruoMcpServer } from '@/features/mcp/server.ts';
import { localeFromHeaders } from '@/i18n/index.tsx';
import { runtime } from '@/server/runtime.server.ts';

/**
 * Remote MCP server (Streamable HTTP, stateless: every request stands alone). Two ways in:
 * - a company API key (`Authorization: Bearer struo_sk_…`, Settings → MCP & API);
 * - an OAuth token (Claude.ai, ChatGPT…, spec 016), its person acting in the company chosen at
 *   consent. A browser session cookie never opens this door.
 */
async function serve(request: Request, actor: Actor): Promise<Response> {
  // Spec 055: assistants through MCP are a feature of the company's plan.
  if (!(await planIncludes(runtime().owner, actor.orgId, 'mcp'))) return refuse('The company’s plan does not include assistant connections (MCP).', 403);
  const locale = localeFromHeaders(null, request.headers.get('accept-language'));
  const server = createStruoMcpServer(runtime(), actor, locale);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

const refuse = (message: string, status = 401) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } }, { status });

let oauth: ((request: Request) => Promise<Response>) | undefined;

async function handle(request: Request): Promise<Response> {
  const { db, auth, env } = runtime();
  const authorization = request.headers.get('authorization') ?? '';
  const key = authorization.match(/^Bearer\s+(struo_sk_\S+)$/iu)?.[1];
  if (key) {
    const actor = await actorFromApiKey(db, key, 'mcp');
    return actor ? serve(request, actor) : refuse('Invalid or revoked API key.');
  }
  oauth ??= requireMcpAuth(
    auth,
    async (verified, claims) => {
      const userId = String(claims.sub ?? '');
      const clientId = String(claims.azp ?? claims.client_id ?? '');
      const actor = userId && clientId ? await actorFromMcpGrant(db, userId, clientId) : null;
      if (!actor) return refuse('This assistant is not (or no longer) connected to a company: reconnect it.', 403);
      return serve(verified, actor);
    },
    { resource: `${env.APP_BASE_URL}/mcp` },
  );
  return oauth(request);
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
});
