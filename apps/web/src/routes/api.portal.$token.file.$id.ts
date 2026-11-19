import { portalFile } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

// A photo or document the company shared with the client of this portal link.
export const Route = createFileRoute('/api/portal/$token/file/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          if (!/^[0-9a-f-]{36}$/iu.test(params.id)) return Response.json({ error: 'not_found' }, { status: 404 });
          const file = await portalFile(runtime().db, params.token, params.id);
          if (!file) return Response.json({ error: 'not_found' }, { status: 404 });
          return serveFile(file.storageKey, file.mediaType);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
