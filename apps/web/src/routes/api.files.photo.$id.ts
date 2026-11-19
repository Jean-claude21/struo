import { photoLocation } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const Route = createFileRoute('/api/files/photo/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          const location = await photoLocation(runtime().db, actor, params.id);
          if (!location) return Response.json({ error: 'not_found' }, { status: 404 });
          return serveFile(location.storageKey, location.mediaType);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
