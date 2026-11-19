import { companyLogoKey } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

/** A company's logo, public: it is printed on its invoices and shown in its client spaces. */
export const Route = createFileRoute('/api/files/logo/$orgId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = await companyLogoKey(runtime().db, params.orgId).catch(() => null);
        const file = key ? await runtime().storage.get(key) : null;
        if (!file) return Response.json({ error: 'not_found' }, { status: 404 });
        return new Response(file.body as unknown as BodyInit, {
          headers: { 'content-type': file.mediaType, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'" },
        });
      },
    },
  },
});
