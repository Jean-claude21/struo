// Error monitoring (spec 041): unexpected errors of the server, the jobs and the e-mails go to the
// error tracker with where they happened. Nothing personal is sent: no e-mail, no name, no body, no
// cookie; only ids. Without SENTRY_DSN (development, tests) errors stay in the log only.
import * as Sentry from '@sentry/node';
import type { Env } from './env.server.ts';

let enabled = false;

/** The environment as people name it: production, staging or development. */
export function deployEnvironment(env: Pick<Env, 'APP_ENV' | 'APP_BASE_URL'>): string {
  if (env.APP_ENV !== 'production') return env.APP_ENV;
  return /staging/u.test(env.APP_BASE_URL) ? 'staging' : 'production';
}

export function initMonitoring(env: Env): void {
  if (enabled || !env.SENTRY_DSN || env.APP_ENV === 'test') return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: deployEnvironment(env),
    release: env.APP_VERSION || undefined,
    // Nothing personal: no user fields, cookies, headers, bodies or query strings.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, genAI: { inputs: false, outputs: false } },
    tracesSampleRate: 0,
    beforeSend(event) {
      // Requests may carry cookies, tokens or personal data: keep only the method and the path.
      if (event.request) event.request = { method: event.request.method, url: event.request.url?.split('?')[0] };
      if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
      return event;
    },
  });
  enabled = true;
}

export interface ErrorContext {
  /** Where it happened: « server-fn », « api », « job:reports », « mail:reset »… */
  where: string;
  userId?: string;
  orgId?: string;
  extra?: Record<string, string | number | boolean | null>;
}

/** Logs the error and, when monitoring is on, sends it with its context. Returns the event id. */
export function reportError(error: unknown, context: ErrorContext): string | undefined {
  console.error(`[${context.where}]`, error);
  if (!enabled) return undefined;
  return Sentry.withScope((scope) => {
    scope.setTag('where', context.where);
    if (context.orgId) scope.setTag('org', context.orgId);
    if (context.userId) scope.setUser({ id: context.userId });
    if (context.extra) scope.setExtras(context.extra);
    return Sentry.captureException(error);
  });
}

/** For a scheduled job: tells the tracker it ran (missed or failed runs raise an alert there). */
export async function monitorJob<T>(slug: string, schedule: string, work: () => Promise<T>): Promise<T> {
  if (!enabled) return work();
  return Sentry.withMonitor(slug, work, { schedule: { type: 'crontab', value: schedule }, checkinMargin: 30, maxRuntime: 20, timezone: 'UTC' });
}
