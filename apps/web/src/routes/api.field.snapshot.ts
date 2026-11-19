import { can, fieldSnapshot, getSettings } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

// What the field app keeps on the phone to work offline.
export const Route = createFileRoute('/api/field/snapshot')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field');
          const { db } = runtime();
          const [snapshot, settings, user] = await Promise.all([
            fieldSnapshot(db, actor),
            getSettings(db, actor),
            db.query<{ name: string }>('select name from "user" where id = $1', [actor.userId]),
          ]);
          return Response.json(
            {
              ...snapshot,
              user: { name: user.rows[0]?.name ?? '', role: actor.role, canReport: can(actor.role, 'field.report') },
              company: { name: settings.name },
            },
            { headers: { 'cache-control': 'no-store' } },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
