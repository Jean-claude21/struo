import { createServerFn } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';
import { isLocale, LOCALE_COOKIE } from '@/i18n/index.tsx';
import { searchCompany } from '@struo/core';
import { chooseCompany, guarded, loadViewer, requestLocale, requireActor } from '@/server/context.server.ts';
import { deployEnvironment, reportError } from '@/server/monitor.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** What every page needs: the person's language and who is signed in. */
export const getShell = createServerFn({ method: 'GET' }).handler(async () => {
  const locale = requestLocale();
  let viewer = null;
  try {
    viewer = await loadViewer();
  } catch (error) {
    reportError(error, { where: 'shell' });
  }
  const { env } = runtime();
  // What the browser needs to report its own errors and count visits (spec 041); public values only.
  const monitoring = {
    dsn: env.SENTRY_DSN, environment: deployEnvironment(env), release: env.APP_VERSION,
    umami: env.UMAMI_WEBSITE_ID && env.UMAMI_SCRIPT_URL ? { id: env.UMAMI_WEBSITE_ID, src: env.UMAMI_SCRIPT_URL, domain: new URL(env.APP_BASE_URL).hostname } : null,
  };
  return { locale, viewer, monitoring };
});

export const setLocale = createServerFn({ method: 'POST' })
  .validator((input: { locale: string }) => ({ locale: isLocale(input.locale) ? input.locale : 'fr' }))
  .handler(({ data }) => {
    setCookie(LOCALE_COOKIE, data.locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    return { ok: true };
  });

export const selectCompany = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string }) => ({ orgId: String(input.orgId) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      if (!viewer?.companies.some((company) => company.id === data.orgId)) throw new Error('forbidden');
      chooseCompany(data.orgId);
      return { ok: true };
    }),
  );

/** Command palette: the company's sites, clients, invoices and documents matching a query. */
export const searchEverything = createServerFn({ method: 'GET' })
  .validator((input: { q: string }) => ({ q: String(input?.q ?? '').slice(0, 80) }))
  .handler(({ data }) =>
    guarded(async () => {
      const actor = await requireActor();
      return searchCompany(runtime().db, actor, data.q);
    }),
  );
