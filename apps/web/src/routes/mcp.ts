import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createFileRoute } from '@tanstack/react-router';
import { createStruoMcpServer } from '@/features/mcp/server.ts';
import { localeFromHeaders } from '@/i18n/index.tsx';
import { actorFromRequest } from '@/server/api.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * Remote MCP server (Streamable HTTP, stateless: every request stands alone). Authorization: a
 * company API key (`Authorization: Bearer struo_sk_…`), created in Settings → MCP & API.
 */
async function handle(request: Request): Promise<Response> {
  let actor;
  try {
    // A key is required: a browser session cookie never opens the MCP door.
    if (!/^Bearer\s+struo_sk_/iu.test(request.headers.get('authorization') ?? '')) throw new Error('no key');
    actor = await actorFromRequest(request, 'mcp');
  } catch {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid API key (Authorization: Bearer struo_sk_…).' } },
      { status: 401, headers: { 'www-authenticate': 'Bearer' } },
    );
  }
  const locale = localeFromHeaders(null, request.headers.get('accept-language'));
  const server = createStruoMcpServer(runtime(), actor, locale);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
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
