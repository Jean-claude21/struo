/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { getShell } from '@/features/shell/server.ts';
import { I18nProvider, translate } from '@/i18n/index.tsx';
import appCss from '@/styles.css?url';

export const Route = createRootRoute({
  loader: () => getShell(),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: `Struo — ${translate(loaderData?.locale ?? 'fr', 'app.tagline')}` },
      { name: 'description', content: translate(loaderData?.locale ?? 'fr', 'landing.heroSub') },
      { name: 'theme-color', content: '#e8590c' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
    ],
  }),
  shellComponent: Shell,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

function Shell({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData();
  const locale = data?.locale ?? 'fr';
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="public">
      <h1>404</h1>
      <a href="/">Struo</a>
    </div>
  );
}
