import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { platformKeyOwner } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { createPlatformMcpServer } from '@/features/mcp/platform.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * Spec 056: the founder's console through MCP (Streamable HTTP, stateless). One way in: a platform
 * key (`Authorization: Bearer struo_pk_…`, Console › MCP access), whose creator must still be a
 * platform admin. A read-only key only gets the reading tools.
 */
const refuse = (message: string, status = 401) =>
  Response.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } }, { status });

async function handle(request: Request): Promise<Response> {
  const rt = runtime();
  const key = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(struo_pk_\S+)$/iu)?.[1];
  if (!key) return refuse('A platform key is required (Console › MCP access).');
  const owner = await platformKeyOwner(rt.owner, key);
  if (!owner) return refuse('Invalid or revoked platform key.');
  if (!rt.env.PLATFORM_ADMIN_EMAILS.includes(owner.email.toLowerCase())) return refuse('This key’s creator is no longer a platform admin.', 403);
  const server = createPlatformMcpServer(rt, owner);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const Route = createFileRoute('/mcp_/platform')({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request), DELETE: ({ request }) => handle(request) } },
});
