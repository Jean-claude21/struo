import { digestRecipients, listAlerts, markNotified, type Alert } from '@struo/core';
import { translate } from '@/i18n/index.tsx';
import type { Runtime } from './runtime.server.ts';

const LOCK = 727100;
let started = false;

/** Formats an alert as a line of text (e-mail, WhatsApp, MCP). */
export function alertText(alert: Alert, locale: 'fr' | 'en'): string {
  const params: Record<string, string | number | null> = { ...alert.params };
  if (typeof params.amount === 'number' && typeof params.currency === 'string') {
    params.amount = new Intl.NumberFormat(locale, { style: 'currency', currency: params.currency, maximumFractionDigits: 0 }).format(
      params.amount / 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency: params.currency }).resolvedOptions().maximumFractionDigits ?? 0),
    );
  }
  return `[${translate(locale, `alerts.severity.${alert.severity}`)}] ${translate(locale, `alerts.${alert.kind}`, params)}`;
}

/**
 * The daily digest: once a day per company, owners and admins receive what needs attention.
 * Runs in this process every 15 minutes; a database advisory lock lets one instance work at a time,
 * and notification_log guarantees one digest per company per day.
 */
export async function runDigest(rt: Runtime): Promise<number> {
  const client = await rt.owner.connect();
  let sent = 0;
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [LOCK]);
    if (!rows[0]?.locked) return 0;
    try {
      for (const company of await digestRecipients(rt.owner)) {
        const alerts = (await listAlerts(rt.db, { userId: company.ownerId, orgId: company.orgId })).filter(
          (alert) => alert.severity !== 'info',
        );
        if (!alerts.length || !company.emails.length) {
          await markNotified(rt.owner, company.orgId, 'digest', company.orgId, 'none');
          continue;
        }
        if (!(await markNotified(rt.owner, company.orgId, 'digest', company.orgId, 'email'))) continue;
        const locale = company.locale;
        const lines = alerts.slice(0, 20).map((alert) => `• ${alertText(alert, locale)}`);
        await rt.mailer.send({
          to: company.emails,
          subject: translate(locale, 'digest.subject', { org: company.orgName, n: alerts.length }),
          text: [
            translate(locale, 'digest.intro', { org: company.orgName }),
            '',
            ...lines,
            '',
            translate(locale, 'digest.outro', { url: `${rt.env.APP_BASE_URL}/app` }),
          ].join('\n'),
        });
        sent += 1;
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK]);
    }
  } finally {
    client.release();
  }
  return sent;
}

export function startJobs(rt: Runtime): void {
  if (started) return;
  started = true;
  const tick = () => {
    // The digest leaves after 7:00 UTC (morning in West Africa).
    if (new Date().getUTCHours() < 7) return;
    runDigest(rt).catch((error: unknown) => console.error('[jobs] digest', error));
  };
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, 15 * 60_000).unref?.();
}
