import { postNote } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { authorName, notifyTeam, threadPeople } from '@/server/notify.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** Spec 052: the field writes in the site's internal thread (from the outbox: idempotent by id). */
export const Route = createFileRoute('/api/field/notes')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field');
          const input = (await request.json()) as { id?: string; projectId?: string; body?: string };
          const rt = runtime();
          const result = await postNote(rt.db, actor, input);
          if (result.created) void notifyTeam(rt, actor, String(input.projectId), 'note', { author: await authorName(rt, actor), text: String(input.body ?? '').slice(0, 140) }, await threadPeople(rt, actor.orgId, String(input.projectId)));
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
