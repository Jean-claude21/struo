import { deliveryPhoto } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const Route = createFileRoute('/api/files/delivery/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          const key = await deliveryPhoto(runtime().db, actor, params.id);
          if (!key) return Response.json({ error: 'not_found' }, { status: 404 });
          return serveFile(key, 'image/jpeg');
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
