import { hashToken, portalAccess, portalFile } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const portalDevice = (request: Request, token: string) => {
  const name = `struo_pd_${hashToken(token).slice(0, 16)}=`;
  return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(name))?.slice(name.length) ?? null;
};

// A photo or document the company shared with the client of this portal link (confirmed device only).
export const Route = createFileRoute('/api/portal/$token/file/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!/^[0-9a-f-]{36}$/iu.test(params.id)) return Response.json({ error: 'not_found' }, { status: 404 });
          const link = await portalAccess(runtime().db, params.token, portalDevice(request, params.token));
          if (!link || !link.verified) return Response.json({ error: 'not_found' }, { status: 404 });
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
