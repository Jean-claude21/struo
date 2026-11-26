import { createFileRoute } from '@tanstack/react-router';
import { translate } from '@/i18n/index.tsx';
import { localeOfRequest } from '@/server/mail.server.ts';

/**
 * Spec 084: the office installs like an app (computer or phone), in the person's language. It still
 * needs the network: the service worker never keeps office data, only an « offline » page.
 */
export const Route = createFileRoute('/api/app/manifest')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const locale = localeOfRequest(request);
        return new Response(JSON.stringify({
          id: '/app', name: 'Struo', short_name: 'Struo', description: translate(locale, 'shell.appDescription'),
          start_url: '/app', scope: '/app', display: 'standalone', background_color: '#f8f7f1', theme_color: '#202820', lang: locale,
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
          shortcuts: [
            { name: translate(locale, 'shell.today'), url: '/app' },
            { name: translate(locale, 'shell.sites'), url: '/app/projects' },
          ],
        }), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache', vary: 'cookie, accept-language' } });
      },
    },
  },
});
