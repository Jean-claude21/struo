// Notifications (spec 049): a task given to someone, a change order to approve, the client report.
// One branded e-mail each, in the recipient's company language. Never sent from a demo company, never
// to the person who did the gesture, and a failure never blocks the gesture itself.
import * as core from '@struo/core';
import { translate, type Locale } from '@/i18n/index.tsx';
import { outboundAllowed } from './demo.server.ts';
import { mailMessage } from './mail.server.ts';
import { reportError } from './monitor.server.ts';
import type { Runtime } from './runtime.server.ts';

async function companyLocale(rt: Runtime, orgId: string): Promise<Locale> {
  const { rows } = await rt.owner.query<{ locale: Locale }>('select locale from org_settings where org_id = $1', [orgId]);
  return rows[0]?.locale === 'en' ? 'en' : 'fr';
}

/** The client's link, opened again from its sealed token (links made before spec 049 have none). */
export function portalUrl(rt: Runtime, tokenEnc: string | null): string | null {
  if (!tokenEnc) return null;
  try { return `${rt.env.APP_BASE_URL}/portal/${rt.secrets.open(tokenEnc)}`; } catch { return null; }
}

/** Tells a person a task was given to them (from the office, or from an incident raised in the field). */
export async function notifyTaskAssigned(rt: Runtime, actor: core.Actor, taskId: string): Promise<void> {
  try {
    if (!(await outboundAllowed(rt, actor.orgId))) return;
    const { rows } = await rt.owner.query<{ title: string; dueOn: string | null; code: string; site: string; email: string; userId: string; role: string; incident: boolean }>(
      `select t.title, to_char(t.due_on, 'YYYY-MM-DD') as "dueOn", p.code, p.name as site, u.email, u.id as "userId", m.role, t.incident_id is not null as incident
         from project_task t join project p on p.id = t.project_id join "user" u on u.id = t.assignee_id
         join member m on m."userId" = u.id and m."organizationId" = t.org_id
        where t.id = $1 and t.org_id = $2`, [taskId, actor.orgId]);
    const task = rows[0];
    if (!task || task.userId === actor.userId) return;
    const locale = await companyLocale(rt, actor.orgId);
    const url = `${rt.env.APP_BASE_URL}${task.role === 'site_lead' ? '/field' : '/app/tasks'}`;
    const due = task.dueOn ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(`${task.dueOn}T12:00:00`)) : null;
    await rt.mailer.send(mailMessage(locale, task.email, translate(locale, 'notify.task.subject', { title: task.title.slice(0, 80) }), {
      preheader: translate(locale, 'notify.task.preheader', { code: task.code }),
      title: translate(locale, task.incident ? 'notify.task.titleIncident' : 'notify.task.title'),
      paragraphs: [`${task.title}`, translate(locale, 'notify.task.where', { code: task.code, site: task.site }), ...(due ? [translate(locale, 'notify.task.due', { date: due })] : [])],
      button: { label: translate(locale, 'notify.task.button'), url },
      footnote: translate(locale, 'notify.task.why'),
    }, rt.env.APP_BASE_URL));
  } catch (error) {
    reportError(error, { where: 'notify:task' });
  }
}

/** Tells the client a change order waits for their answer in their space. */
export async function notifyChangeOrderSent(rt: Runtime, actor: core.Actor, changeOrderId: string): Promise<boolean> {
  try {
    if (!(await outboundAllowed(rt, actor.orgId))) return false;
    const { rows } = await rt.owner.query<{ number: number; title: string; projectId: string; project: string; company: string; email: string | null; contactName: string | null; tokenEnc: string | null }>(
      `select c.number, c.title, c.project_id as "projectId", p.name as project, o.name as company,
              l.contact_email as email, l.contact_name as "contactName", l.token_enc as "tokenEnc"
         from change_order c join project p on p.id = c.project_id join organization o on o.id = c.org_id
         left join lateral (select * from portal_link x where x.project_id = c.project_id and x.revoked_at is null order by x.created_at desc limit 1) l on true
        where c.id = $1 and c.org_id = $2`, [changeOrderId, actor.orgId]);
    const order = rows[0];
    if (!order?.email) return false;
    const locale = await companyLocale(rt, actor.orgId);
    const url = portalUrl(rt, order.tokenEnc);
    await rt.mailer.send(mailMessage(locale, order.email, translate(locale, 'notify.change.subject', { project: order.project, company: order.company }), {
      preheader: translate(locale, 'notify.change.preheader', { n: order.number }),
      title: translate(locale, 'notify.change.title'),
      paragraphs: [translate(locale, 'notify.change.body', { name: order.contactName ?? '', company: order.company, n: order.number, title: order.title, project: order.project }),
        ...(url ? [] : [translate(locale, 'notify.noLink')])],
      ...(url ? { button: { label: translate(locale, 'notify.change.button'), url } } : {}),
    }, rt.env.APP_BASE_URL));
    return true;
  } catch (error) {
    reportError(error, { where: 'notify:change' });
    return false;
  }
}

/** Sends the client report e-mail: the period, the company's words, a button to the report in their space. */
export async function mailClientReport(rt: Runtime, input: { locale: Locale; to: string; contactName: string | null; company: string; project: string; from: string; to_: string; url: string | null }): Promise<void> {
  const date = (value: string) => new Intl.DateTimeFormat(input.locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
  await rt.mailer.send(mailMessage(input.locale, input.to, translate(input.locale, 'notify.report.subject', { project: input.project, company: input.company }), {
    preheader: translate(input.locale, 'notify.report.preheader', { from: date(input.from), to: date(input.to_) }),
    title: translate(input.locale, 'notify.report.title', { project: input.project }),
    paragraphs: [translate(input.locale, 'notify.report.body', { name: input.contactName ?? '', company: input.company, from: date(input.from), to: date(input.to_) }),
      ...(input.url ? [] : [translate(input.locale, 'notify.noLink')])],
    ...(input.url ? { button: { label: translate(input.locale, 'notify.report.button'), url: input.url } } : {}),
  }, rt.env.APP_BASE_URL));
}

/**
 * The weekly client report (Monday morning, local time) for companies that chose it: the past week,
 * one send per site and week.
 */
export async function runClientReports(rt: Runtime, now: Date, localClock: (timeZone: string, now?: Date) => { hour: number; day: Date }): Promise<number> {
  let sent = 0;
  for (const target of await core.weeklyReportTargets(rt.owner)) {
    const local = localClock(target.timeZone, now);
    if (local.hour < 7 || local.day.getUTCDay() !== 1) continue;
    const to = new Date(local.day.getTime() - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(local.day.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    if (!(await core.markNotified(rt.owner, target.orgId, 'client_report', `${target.projectId}:${from}`, 'email'))) continue;
    try {
      const id = await core.saveAutomaticClientReport(rt.owner, { orgId: target.orgId, projectId: target.projectId, from, to, sentTo: target.email });
      const base = portalUrl(rt, target.tokenEnc);
      await mailClientReport(rt, { locale: target.locale, to: target.email, contactName: target.contactName, company: target.company, project: target.projectName, from, to_: to, url: base ? `${base}/report/${id}` : null });
      sent++;
    } catch (error) {
      reportError(error, { where: 'job:client-report', orgId: target.orgId });
    }
  }
  return sent;
}
