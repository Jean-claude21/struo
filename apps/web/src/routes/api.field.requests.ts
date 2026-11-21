import { createMaterialRequest } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { authorName, notifyTeam } from '@/server/notify.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** Spec 052: material asked for from the field (from the outbox: idempotent by id). */
export const Route = createFileRoute('/api/field/requests')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field', 'field.report');
          const input = (await request.json()) as { projectId?: string; item?: string; quantity?: string | null };
          const rt = runtime();
          const result = await createMaterialRequest(rt.db, actor, input);
          if (result.created) {
            void notifyTeam(rt, actor, String(input.projectId), 'material', { author: await authorName(rt, actor), item: String(input.item ?? ''), quantity: String(input.quantity ?? '') });
          }
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
