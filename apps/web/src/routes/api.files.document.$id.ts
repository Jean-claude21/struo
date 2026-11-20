import { documentFile, documentVersionFile } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const Route = createFileRoute('/api/files/document/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          // Spec 046: « ?version=<id> » serves a previous file of the document.
          const version = new URL(request.url).searchParams.get('version');
          const file = version ? await documentVersionFile(runtime().db, actor, params.id, version) : await documentFile(runtime().db, actor, params.id);
          if (!file?.storageKey) return Response.json({ error: 'not_found' }, { status: 404 });
          return serveFile(file.storageKey, file.mediaType ?? 'application/octet-stream', file.title);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
