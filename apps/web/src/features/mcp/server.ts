import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as core from '@struo/core';
import { z } from 'zod';
import { capabilitiesFor, contextFor } from '@/features/intelligence/capabilities.server.ts';
import type { Runtime } from '@/server/runtime.server.ts';

/**
 * The MCP door (specs 011 and 034): one tool per capability of the registry, generated — the same
 * list as the in-app assistant and the documentation page. Every call acts as the key's member or
 * the signed-in person, under row-level security and the same permission table as the screens; a
 * capability the role may not use is not offered. A gesture that commits (levels 3 and 4: an
 * invoice, a payment, an e-mail to a client…) first answers a preview, and only acts when called
 * again with `confirmed: true` after the person said yes.
 */
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify(error instanceof core.DomainError ? { error: error.code, ...error.params } : { error: 'generic' }) }],
});

export function createStruoMcpServer(rt: Runtime, actor: core.Actor, locale: 'fr' | 'en'): McpServer {
  const server = new McpServer(
    { name: 'struo', version: process.env.APP_VERSION ?? '0.1.0' },
    {
      instructions:
        'Struo holds one construction company: sites, field reports and incidents, invoices and payments, documents, milestones, costs, client spaces and the team. Call `context` first. Sites are named by their code (KC-01). Amounts are integers in minor units with their currency (XOF has no decimals). Never compute a total yourself: read it from a tool. Tools that commit (invoice, payment, reminder, e-mail to a client, invitation) answer a preview first: show it to the person and call again with `confirmed: true` only after their explicit yes.',
    },
  );
  const context = contextFor(rt, actor, locale);

  for (const capability of capabilitiesFor(actor.role)) {
    const commits = capability.autonomy >= 3;
    const shape = commits
      ? { ...capability.input.shape, confirmed: z.boolean().optional().describe('true only after the person approved the preview') }
      : capability.input.shape;
    server.registerTool(
      capability.name,
      {
        description: `${capability.description}${commits ? ' Commits: answers a preview first; call again with confirmed: true after the person agrees.' : ''}`,
        inputSchema: shape,
        annotations: { readOnlyHint: capability.autonomy === 1, destructiveHint: capability.autonomy === 4, openWorldHint: capability.name === 'invite_client' || capability.name === 'invite_member' },
      },
      async (args: Record<string, unknown>) => {
        try {
          const { confirmed, ...rest } = args as Record<string, unknown> & { confirmed?: boolean };
          const input = capability.input.parse(rest);
          if (commits && confirmed !== true) {
            return text({ preview: capability.summary ? await capability.summary(context, input) : input, needsConfirmation: true,
              next: `Show this to the person. If they agree, call ${capability.name} again with the same arguments and confirmed: true.` });
          }
          return text((await capability.run(context, input)) ?? { ok: true });
        } catch (error) {
          if (error instanceof z.ZodError) return failure(new core.DomainError('invalid_input', 422, { detail: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }));
          return failure(error);
        }
      },
    );
  }
  return server;
}
