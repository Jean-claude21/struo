import { portalView } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

/** Spec 051: the client's space installs on the phone like an app, named after their site. */
export const Route = createFileRoute('/api/portal/$token/manifest')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const view = await portalView(runtime().db, params.token).catch(() => null);
        if (!view) return new Response(null, { status: 404 });
        const name = `${view.project.name} · ${view.company.name}`.slice(0, 60);
        return new Response(JSON.stringify({
          name, short_name: view.project.name.slice(0, 20), start_url: `/portal/${params.token}`, scope: `/portal/${params.token}`,
          display: 'standalone', orientation: 'portrait', background_color: '#f8f7f1', theme_color: view.company.brandColor ?? '#202820',
          lang: view.company.locale ?? 'fr',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        }), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
      },
    },
  },
});
