import { assertFeature } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { runTurn, type IntelligenceEvent } from '@/features/intelligence/agent.server.ts';
import { localeFromHeaders } from '@/i18n/index.tsx';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const body = z.object({
  question: z.string().trim().min(2).max(2000),
  history: z.array(z.object({ q: z.string().max(2000), a: z.string().max(8000) })).max(10).default([]),
  page: z.object({ path: z.string().max(300), label: z.string().max(200).optional(), projectId: z.string().uuid().optional() }),
});

/**
 * Struo Intelligence (spec 034): one turn streamed as JSON lines (`IntelligenceEvent`), as the person
 * signed in, with the capabilities of her role. Closing the request stops the turn.
 */
export const Route = createFileRoute('/api/intelligence')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          // Spec 055: the assistant is a feature of the company's plan.
          await assertFeature(runtime().owner, actor.orgId, 'ai');
          const turn = body.parse(await request.json());
          const locale = localeFromHeaders(request.headers.get('cookie'), request.headers.get('accept-language'));
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const emit = (event: IntelligenceEvent) => {
                try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* closed */ }
              };
              await runTurn(runtime(), actor, locale, turn, emit, request.signal);
              try { controller.close(); } catch { /* closed */ }
            },
          });
          return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
