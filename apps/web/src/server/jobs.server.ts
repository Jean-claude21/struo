import { companyKpis, digestRecipients, getSettings, listAlerts, markNotified, reportRecipients, resolveActor, type Alert } from '@struo/core';
import { translate } from '@/i18n/index.tsx';
import type { Runtime } from './runtime.server.ts';

const LOCK = 727100;
const REPORT_LOCK = 727101;
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

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function moneyText(locale: 'fr' | 'en', minor: number, currency: string): string {
  const decimals = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 10 ** decimals);
}

export type ReportPeriod = { kind: 'weekly' | 'monthly'; key: string; from: string; to: string };

/** The periods whose report leaves today: the past week on Mondays, the past month on the 1st. */
export function reportPeriods(today: Date): ReportPeriod[] {
  const periods: ReportPeriod[] = [];
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12));
  const yesterday = isoDay(new Date(day.getTime() - 86_400_000));
  if (day.getUTCDay() === 1) {
    const from = isoDay(new Date(day.getTime() - 7 * 86_400_000));
    periods.push({ kind: 'weekly', key: `week:${from}`, from, to: yesterday });
  }
  if (day.getUTCDate() === 1) {
    const from = isoDay(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1, 12)));
    periods.push({ kind: 'monthly', key: `month:${from.slice(0, 7)}`, from, to: yesterday });
  }
  return periods;
}

/**
 * The weekly (Monday) and monthly (1st) reports (spec 039): owners and admins receive the key
 * indicators of the period and a link to the full printable report. One send per company and period.
 */
export async function runReports(rt: Runtime, today = new Date()): Promise<number> {
  const periods = reportPeriods(today);
  if (!periods.length) return 0;
  const client = await rt.owner.connect();
  let sent = 0;
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [REPORT_LOCK]);
    if (!rows[0]?.locked) return 0;
    try {
      for (const company of await reportRecipients(rt.owner)) {
        for (const period of periods) {
          if (!(await markNotified(rt.owner, company.orgId, `report.${period.kind}`, period.key, 'email'))) continue;
          try {
            const actor = await resolveActor(rt.db, company.ownerId, company.orgId, 'web');
            if (!actor) continue;
            const [k, settings] = await Promise.all([companyKpis(rt.db, actor, { from: period.from, to: period.to }), getSettings(rt.db, actor)]);
            const locale = company.locale;
            const tr = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
            const cur = (minor: number) => moneyText(locale, minor, settings.currencyCode);
            const lines: string[] = [];
            if (k.finance) {
              lines.push(`- ${tr('kpi.invoiced')} : ${cur(k.finance.invoicedMinor)}`);
              lines.push(`- ${tr('kpi.collected')} : ${cur(k.finance.collectedMinor)}`);
              lines.push(`- ${tr('kpi.spent')} : ${cur(k.finance.spentMinor)}`);
              lines.push(`- ${tr('kpi.receivable')} : ${cur(k.finance.receivableMinor)} (${tr('kpi.overdue')} ${cur(k.finance.overdueMinor)})`);
              if (k.finance.dsoDays !== null) lines.push(`- ${tr('kpi.dso')} : ${tr('kpi.days', { n: k.finance.dsoDays })}`);
              if (k.finance.runwayMonths !== null) lines.push(`- ${tr('kpi.runway')} : ${tr('kpi.months', { n: new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 1 }).format(k.finance.runwayMonths) })}`);
            }
            if (k.planning.spi !== null) lines.push(`- ${tr('kpi.spi')} : ${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(k.planning.spi)} (${tr('kpi.sitesBehind', { n: k.planning.sitesBehind })})`);
            lines.push(`- ${tr('kpi.lateMilestones')} : ${k.planning.lateMilestones}`);
            lines.push(`- ${tr('kpi.reports')} : ${k.field.reports} · ${tr('kpi.toReview')} : ${k.field.toReview}`);
            lines.push(`- ${tr('kpi.incidents')} : ${k.field.openIncidents} (${tr('kpi.critical', { n: k.field.criticalIncidents, created: k.field.newIncidents })})`);
            if (k.compliance.pct !== null) lines.push(`- ${tr('kpi.compliance')} : ${k.compliance.pct} %`);
            await rt.mailer.send({
              to: company.emails,
              subject: tr(period.kind === 'weekly' ? 'kpi.mail.weeklySubject' : 'kpi.mail.monthlySubject', { company: company.orgName }),
              text: [
                tr('kpi.mail.intro', { company: company.orgName, from: period.from, to: period.to }), '', ...lines, '',
                `${tr('kpi.mail.open')} : ${rt.env.APP_BASE_URL}/print/report?from=${period.from}&to=${period.to}`,
              ].join('\n'),
            });
            sent += 1;
          } catch (error) {
            console.error('[jobs] report', company.orgId, error);
          }
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [REPORT_LOCK]);
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
    runReports(rt).catch((error: unknown) => console.error('[jobs] reports', error));
  };
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, 15 * 60_000).unref?.();
}
