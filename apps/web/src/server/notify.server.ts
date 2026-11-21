// Notifications (spec 049): a task given to someone, a change order to approve, the client report.
// One branded e-mail each, in the recipient's company language. Never sent from a demo company, never
// to the person who did the gesture, and a failure never blocks the gesture itself.
import * as core from '@struo/core';
import { translate, type Locale } from '@/i18n/index.tsx';
import { outboundAllowed } from './demo.server.ts';
import { mailMessage } from './mail.server.ts';
import { reportError } from './monitor.server.ts';
import { sendPush } from './push.server.ts';
import { draftSections } from './report.server.ts';
import type { Runtime } from './runtime.server.ts';

export async function companyLocale(rt: Runtime, orgId: string): Promise<Locale> {
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
    void notifyClient(rt, actor.orgId, order?.projectId ?? '', 'change', { n: order?.number ?? 0 });
    if (!order?.email || (await core.clientOptedOut(rt.owner, order.projectId))) return false;
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

/** Freezes a draft and e-mails the client a button to it in their space (spec 050). */
export async function deliverClientReport(rt: Runtime, actor: core.Actor, id: string): Promise<{ id: string; mailed: boolean; withLink: boolean }> {
  const draft = await core.clientReportDraft(rt.db, actor, id);
  const contact = await core.portalContact(rt.db, actor, draft.projectId);
  if (!contact?.contactEmail) throw new core.DomainError('client_email_missing', 422);
  const report = await core.sendClientReportDraft(rt.db, actor, id, contact.contactEmail);
  const base = portalUrl(rt, contact.tokenEnc);
  const outbound = await outboundAllowed(rt, actor.orgId) && !(await core.clientOptedOut(rt.owner, draft.projectId));
  void notifyClient(rt, actor.orgId, draft.projectId, 'report', { reportId: id });
  if (outbound) {
    await mailClientReport(rt, { locale: await companyLocale(rt, actor.orgId), to: contact.contactEmail, contactName: contact.contactName, company: report.company.name,
      project: report.project.name, from: report.period.from, to_: report.period.to, url: base ? `${base}/report/${id}` : null });
  }
  return { id, mailed: outbound && rt.mailer.configured, withLink: Boolean(base) };
}

/**
 * The weekly client report (Monday morning, local time) for companies that chose it: the past week,
 * one per site and week. A draft for the site manager to read (e-mailed to them), or — when the
 * company chose so — sent to the client at once.
 */
export async function runClientReports(rt: Runtime, now: Date, localClock: (timeZone: string, now?: Date) => { hour: number; day: Date }): Promise<number> {
  let done = 0;
  for (const target of await core.weeklyReportTargets(rt.owner)) {
    const local = localClock(target.timeZone, now);
    if (local.hour < 7 || local.day.getUTCDay() !== 1) continue;
    const to = new Date(local.day.getTime() - 86_400_000).toISOString().slice(0, 10);
    const from = new Date(local.day.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    if (!(await core.markNotified(rt.owner, target.orgId, 'client_report', `${target.projectId}:${from}`, 'email'))) continue;
    try {
      const facts = await core.automaticReportFacts(rt.owner, target.orgId, target.projectId, from, to);
      const { sections } = await draftSections(rt, target.locale, facts);
      const id = await core.saveAutomaticClientReport(rt.owner, { orgId: target.orgId, projectId: target.projectId, from, to, sections, sentTo: target.autoSend ? target.email : null });
      if (target.autoSend) {
        const base = portalUrl(rt, target.tokenEnc);
        await notifyClient(rt, target.orgId, target.projectId, 'report', { reportId: id });
        if (!(await core.clientOptedOut(rt.owner, target.projectId))) await mailClientReport(rt, { locale: target.locale, to: target.email, contactName: target.contactName, company: target.company, project: target.projectName, from, to_: to, url: base ? `${base}/report/${id}` : null });
      } else if (target.officeEmail) {
        await mailReportReady(rt, { locale: target.locale, to: target.officeEmail, code: target.projectCode, project: target.projectName, projectId: target.projectId, from, to_: to });
      }
      done++;
    } catch (error) {
      reportError(error, { where: 'job:client-report', orgId: target.orgId });
    }
  }
  return done;
}

/** Tells the site manager the weekly draft waits for their reading. */
async function mailReportReady(rt: Runtime, input: { locale: Locale; to: string; code: string; project: string; projectId: string; from: string; to_: string }): Promise<void> {
  const date = (value: string) => new Intl.DateTimeFormat(input.locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
  await rt.mailer.send(mailMessage(input.locale, input.to, translate(input.locale, 'reportDraft.readyMail.subject', { code: input.code }), {
    preheader: translate(input.locale, 'reportDraft.readyMail.preheader'),
    title: translate(input.locale, 'reportDraft.readyMail.title'),
    paragraphs: [translate(input.locale, 'reportDraft.readyMail.body', { from: date(input.from), to: date(input.to_), code: input.code, project: input.project })],
    button: { label: translate(input.locale, 'reportDraft.readyMail.button'), url: `${rt.env.APP_BASE_URL}/app/projects/${input.projectId}?tab=report` },
    footnote: translate(input.locale, 'reportDraft.readyMail.why'),
  }, rt.env.APP_BASE_URL));
}

// ---------------------------------------------------------------- the client's phone and inbox (spec 051)

export type ClientEvent = 'report' | 'change' | 'milestone' | 'invoice' | 'message' | 'paymentOk' | 'paymentNo';

/**
 * Tells the client something new waits in their space: a notification on their phone when they
 * accepted them, and — for what needs them (an invoice, a stage to sign off, a refused payment) —
 * an e-mail unless they opted out. The report and change order e-mails are sent by their own doors.
 */
export async function notifyClient(rt: Runtime, orgId: string, projectId: string, event: ClientEvent, params: Record<string, string | number> & { reportId?: string } = {}): Promise<void> {
  try {
    if (!projectId || !(await outboundAllowed(rt, orgId))) return;
    const targets = await core.portalPushTargets(rt.owner, projectId);
    for (const target of targets) {
      const base = portalUrl(rt, target.tokenEnc);
      if (!base) continue;
      await sendPush(rt, [target], {
        title: translate(target.locale, `clientPush.${event}.title`, params),
        body: translate(target.locale, `clientPush.${event}.body`, params),
        url: params.reportId ? `${base}/report/${params.reportId}` : base,
        tag: `${event}:${projectId}`,
      });
    }
    if (!['invoice', 'milestone', 'paymentNo'].includes(event)) return;
    for (const recipient of await core.clientRecipients(rt.owner, projectId)) {
      const url = portalUrl(rt, recipient.tokenEnc);
      const values = { ...params, company: recipient.company, project: recipient.project, name: recipient.contactName ?? '' };
      await rt.mailer.send(mailMessage(recipient.locale, recipient.email, translate(recipient.locale, `clientPush.${event}.subject`, values), {
        preheader: translate(recipient.locale, `clientPush.${event}.body`, values),
        title: translate(recipient.locale, `clientPush.${event}.title`, values),
        paragraphs: [translate(recipient.locale, `clientPush.${event}.mail`, values), ...(url ? [] : [translate(recipient.locale, 'notify.noLink')])],
        ...(url ? { button: { label: translate(recipient.locale, 'clientPush.open'), url } } : {}),
        footnote: translate(recipient.locale, 'clientPush.why', { company: recipient.company }),
      }, rt.env.APP_BASE_URL));
    }
  } catch (error) {
    reportError(error, { where: `notify:client:${event}` });
  }
}

/** Tells the people who handle money that a client declares a payment (e-mail and phone). */
export async function notifyClaimDeclared(rt: Runtime, orgId: string, projectId: string): Promise<void> {
  try {
    if (!(await outboundAllowed(rt, orgId))) return;
    const { rows } = await rt.owner.query<{ userId: string; email: string; code: string; project: string; client: string | null }>(
      `select u.id as "userId", u.email, p.code, p.name as project, c.name as client
         from member m join "user" u on u.id = m."userId" join project p on p.id = $2 left join client c on c.id = p.client_id
        where m."organizationId" = $1 and m.role in ('owner', 'admin', 'accountant')`, [orgId, projectId]);
    if (!rows.length) return;
    const locale = await companyLocale(rt, orgId);
    const first = rows[0]!;
    const values = { code: first.code, project: first.project, client: first.client ?? '' };
    const url = `${rt.env.APP_BASE_URL}/app/finance?tab=claims`;
    await sendPush(rt, await core.memberPushTargets(rt.owner, orgId, rows.map((row) => row.userId)), {
      title: translate(locale, 'claims.push.title'), body: translate(locale, 'claims.push.body', values), url, tag: `claim:${projectId}`,
    });
    for (const row of rows) {
      await rt.mailer.send(mailMessage(locale, row.email, translate(locale, 'claims.mail.subject', values), {
        preheader: translate(locale, 'claims.push.body', values),
        title: translate(locale, 'claims.push.title'),
        paragraphs: [translate(locale, 'claims.mail.body', values)],
        button: { label: translate(locale, 'claims.mail.button'), url },
        footnote: translate(locale, 'claims.mail.why'),
      }, rt.env.APP_BASE_URL));
    }
  } catch (error) {
    reportError(error, { where: 'notify:claim' });
  }
}
