// Browser error monitoring (spec 041). The tracker loads only when a key is configured, after the
// page is interactive; errors are sent with the person's id only (no name, no e-mail, no content).
import type * as SentryBrowser from '@sentry/react';

export interface MonitoringConfig {
  dsn: string;
  environment: string;
  release: string;
}

let sentry: typeof SentryBrowser | null = null;
let loading: Promise<void> | null = null;

export function initBrowserMonitoring(config: MonitoringConfig | undefined, userId?: string): Promise<void> {
  if (!config?.dsn || typeof window === 'undefined') return Promise.resolve();
  loading ??= import('@sentry/react').then((module) => {
    module.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release || undefined,
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      tracesSampleRate: 0,
      // Noise from extensions and lost connections is not ours to fix.
      ignoreErrors: ['ResizeObserver loop', 'Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
      denyUrls: [/extensions\//iu, /^chrome:\/\//iu, /^moz-extension:\/\//iu],
      beforeSend(event) {
        if (event.request?.url) event.request.url = event.request.url.split('?')[0];
        return event;
      },
    });
    sentry = module;
  }).catch(() => undefined);
  return loading.then(() => { if (userId) sentry?.setUser({ id: userId }); });
}

/** Logs and reports an error from the browser; returns the event id shown to the person. */
export function reportClientError(error: unknown, where: string, extra?: Record<string, string | number | boolean | null>): string | undefined {
  console.error(`[${where}]`, error);
  if (!sentry) return undefined;
  return sentry.withScope((scope) => {
    scope.setTag('where', where);
    if (extra) scope.setExtras(extra);
    return sentry!.captureException(error);
  });
}
