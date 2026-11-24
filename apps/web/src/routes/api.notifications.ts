// Spec 073: the notification centre — the person's own notices, and marking them read. Used by the
// bell of the office and of the field app (session cookie).
import { markNoticesRead, myNotices } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const Route = createFileRoute('/api/notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          return Response.json(await myNotices(runtime().db, actor), { headers: { 'cache-control': 'no-store' } });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
          return Response.json({ marked: await markNoticesRead(runtime().db, actor, Array.isArray(body.ids) ? body.ids : undefined) });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
