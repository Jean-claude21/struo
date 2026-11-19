import { createServerFn } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';
import { isLocale, LOCALE_COOKIE } from '@/i18n/index.tsx';
import { chooseCompany, guarded, loadViewer, requestLocale } from '@/server/context.server.ts';

/** What every page needs: the person's language and who is signed in. */
export const getShell = createServerFn({ method: 'GET' }).handler(async () => {
  const locale = requestLocale();
  let viewer = null;
  try {
    viewer = await loadViewer();
  } catch (error) {
    console.error('[shell]', error);
  }
  return { locale, viewer };
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
