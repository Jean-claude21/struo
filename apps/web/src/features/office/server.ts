// Server functions of the office (/app). Each one resolves the acting member on the server, then
// calls the core; no rule lives here (constitution II).
import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { translate } from '@/i18n/index.tsx';
import { guarded, requestLocale, requireActor } from '@/server/context.server.ts';
import { alertText } from '@/server/jobs.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const any = (input: unknown) => input as Record<string, unknown>;
const idOf = (input: unknown) => {
  const id = (input as { id?: unknown })?.id;
  if (typeof id !== 'string' || id.length > 64) throw new Error('invalid_input');
  return { id };
};
const act = <T>(work: (actor: core.Actor) => Promise<T>, permission?: core.Permission) =>
  guarded(async () => work(await requireActor(permission)));

// ---------------------------------------------------------------- dashboard

export const getDashboard = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [settings, finance, operations, alerts, projects, activity, subscription] = await Promise.all([
      core.getSettings(db, actor),
      core.can(actor.role, 'finance.read') ? core.financeSummary(db, actor) : Promise.resolve(null),
      core.operationsSummary(db, actor),
      core.listAlerts(db, actor),
      core.listProjects(db, actor),
      core.recentActivity(db, actor, 15),
      core.getSubscription(db, actor),
    ]);
    return { role: actor.role, settings, finance, operations, alerts, projects, activity, subscription };
  }),
);

// ---------------------------------------------------------------- projects and clients

export const getProjects = createServerFn({ method: 'GET' })
  .validator((input: { q?: string; status?: string; typeId?: string } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const [projects, configuration, clients, members, settings] = await Promise.all([
        core.listProjects(db, actor, data),
        core.getConfiguration(db, actor),
        core.listClients(db, actor),
        core.listMembers(db, actor),
        core.getSettings(db, actor),
      ]);
      return { role: actor.role, projects, configuration, clients, members, currency: settings.currencyCode };
    }),
  );

export const getProjectPage = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const project = await core.getProject(db, actor, data.id);
      const canFinance = core.can(actor.role, 'finance.read');
      const [reports, incidents, invoices, payments, documents, milestones, expenses, messages, links, configuration, clients, members] =
        await Promise.all([
          core.listReports(db, actor, { projectId: data.id, limit: 50 }),
          core.listIncidents(db, actor, { projectId: data.id }),
          canFinance ? core.listInvoices(db, actor, { projectId: data.id }) : Promise.resolve([]),
          canFinance ? core.listPayments(db, actor, { projectId: data.id }) : Promise.resolve([]),
          core.listDocuments(db, actor, { projectId: data.id }),
          core.listMilestones(db, actor, { projectId: data.id }),
          core.listExpenses(db, actor, { projectId: data.id }),
          core.listMessages(db, actor, data.id),
          core.listPortalLinks(db, actor, data.id),
          core.getConfiguration(db, actor),
          core.listClients(db, actor),
          core.listMembers(db, actor),
        ]);
      return {
        role: actor.role, userId: actor.userId, project, reports, incidents, invoices, payments, documents, milestones,
        expenses, messages, links, configuration, clients, members,
      };
    }),
  );

export const createProject = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.createProject(runtime().db, actor, data)));

export const updateProject = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateProject(runtime().db, actor, data.id, data.patch)));

export const archiveProject = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.archiveProject(runtime().db, actor, data.id)));

export const updatePhase = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updatePhase(runtime().db, actor, data.id, data.patch)));

export const addPhase = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; name: string; budgetMinor?: number }) => input)
  .handler(({ data }) => act((actor) => core.addPhase(runtime().db, actor, data.projectId, data)));

export const removePhase = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.removePhase(runtime().db, actor, data.id)));

export const importProjects = createServerFn({ method: 'POST' })
  .validator((input: { csv: string }) => ({ csv: String(input.csv).slice(0, 2_000_000) }))
  .handler(({ data }) => act((actor) => core.importProjectsCsv(runtime().db, actor, data.csv)));

export const getClients = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => ({ role: actor.role, clients: await core.listClients(runtime().db, actor) })),
);

export const createClient = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.createClient(runtime().db, actor, data)));

export const updateClient = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateClient(runtime().db, actor, data.id, data.patch)));

// ---------------------------------------------------------------- field (office side)

export const getField = createServerFn({ method: 'GET' })
  .validator((input: { status?: string } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const [reports, incidents] = await Promise.all([
        core.listReports(db, actor, { status: data.status, limit: 100 }),
        core.listIncidents(db, actor, {}),
      ]);
      return { role: actor.role, reports, incidents };
    }),
  );

export const reviewReport = createServerFn({ method: 'POST' })
  .validator((input: { id: string; decision: string; note?: string }) => input)
  .handler(({ data }) => act((actor) => core.reviewReport(runtime().db, actor, data.id, data)));

export const resolveIncident = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.resolveIncident(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- finance

export const getFinance = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db, messenger, mailer, drafter } = runtime();
    const [invoices, payments, aging, summary, projects, settings] = await Promise.all([
      core.listInvoices(db, actor),
      core.listPayments(db, actor),
      core.receivablesAging(db, actor),
      core.financeSummary(db, actor),
      core.listProjects(db, actor),
      core.getSettings(db, actor),
    ]);
    return {
      role: actor.role, invoices, payments, aging, summary, settings,
      projects: projects.map((project) => ({ id: project.id, code: project.code, name: project.name })),
      channels: { whatsapp: messenger.configured, email: mailer.configured, ai: drafter.configured },
    };
  }, 'finance.read'),
);

export const createInvoice = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.createInvoice(runtime().db, actor, data)));

export const cancelInvoice = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.cancelInvoice(runtime().db, actor, data.id)));

export const recordPayment = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.recordPayment(runtime().db, actor, data)));

/** Drafts a reminder or a formal notice from the invoice's real figures (AI when configured). */
export const draftReminder = createServerFn({ method: 'POST' })
  .validator((input: { id: string; kind: 'reminder' | 'formal_notice' }) => ({
    id: String(input.id),
    kind: input.kind === 'formal_notice' ? ('formal_notice' as const) : ('reminder' as const),
  }))
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, drafter } = runtime();
      const locale = requestLocale();
      const invoice = await core.invoiceDocument(db, actor, data.id);
      const money = (minor: number) =>
        new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: invoice.currency_code, maximumFractionDigits: core.currencyDecimals(invoice.currency_code) }).format(
          core.fromMinor(minor, invoice.currency_code),
        );
      const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR').format(new Date(`${value}T12:00:00Z`));
      const facts = {
        number: invoice.number,
        issuedOn: date(invoice.issued_on),
        dueOn: date(invoice.due_on),
        project: invoice.project_name,
        balance: money(invoice.balance_minor ?? invoice.net_minor),
        company: invoice.company_name,
        client: invoice.client_name ?? '',
      };
      if (drafter.configured) {
        try {
          return { text: await drafter.draft({ kind: data.kind, locale, facts }), ai: true, clientEmail: invoice.client_email, clientPhone: invoice.client_phone };
        } catch (error) {
          console.error('[ai] draft', error);
        }
      }
      return { text: translate(locale, `drafts.${data.kind}`, facts), ai: false, clientEmail: invoice.client_email, clientPhone: invoice.client_phone };
    }, 'finance.write'),
  );

/** Records a reminder and, when asked, sends it by e-mail or WhatsApp to the client. */
export const sendReminder = createServerFn({ method: 'POST' })
  .validator((input: { id: string; kind: string; channel: string; body: string; send: boolean }) => input)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, mailer, messenger } = runtime();
      const invoice = await core.invoiceDocument(db, actor, data.id);
      if (data.send && data.channel === 'email' && invoice.client_email) {
        const subject = data.body.split('\n')[0]?.replace(/^(Objet|Subject)\s*:\s*/u, '') ?? invoice.number;
        await mailer.send({ to: invoice.client_email, subject, text: data.body });
      }
      if (data.send && data.channel === 'whatsapp' && invoice.client_phone) await messenger.send(invoice.client_phone, data.body);
      return core.recordReminder(db, actor, data.id, { kind: data.kind, channel: data.channel, body: data.body });
    }, 'finance.write'),
  );

export const getInvoicePrint = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.invoiceDocument(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- expenses

export const getExpenses = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [expenses, byProject, bySegment, projects, settings] = await Promise.all([
      core.listExpenses(db, actor),
      core.marginByProject(db, actor),
      core.marginBySegment(db, actor),
      core.listProjects(db, actor),
      core.getSettings(db, actor),
    ]);
    return {
      role: actor.role, expenses, byProject, bySegment, currency: settings.currencyCode,
      projects: projects.map((project) => ({ id: project.id, code: project.code, name: project.name })),
    };
  }),
);

export const addExpense = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.addExpense(runtime().db, actor, data)));

export const removeExpense = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.removeExpense(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- documents

export const getDocuments = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [documents, compliance, configuration, projects] = await Promise.all([
      core.listDocuments(db, actor),
      core.complianceByProject(db, actor),
      core.getConfiguration(db, actor),
      core.listProjects(db, actor),
    ]);
    return {
      role: actor.role, documents, compliance, docTypes: configuration.docTypes,
      projects: projects.map((project) => ({ id: project.id, code: project.code, name: project.name })),
    };
  }),
);

export const addDocument = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.addDocument(runtime().db, actor, data)));

export const updateDocument = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateDocument(runtime().db, actor, data.id, data.patch)));

export const removeDocument = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.removeDocument(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- planning

export const getPlanning = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [gantt, late, projects] = await Promise.all([
      core.gantt(db, actor),
      core.listMilestones(db, actor, { late: true }),
      core.listProjects(db, actor),
    ]);
    return { role: actor.role, gantt, late, projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name })) };
  }),
);

export const addMilestone = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.addMilestone(runtime().db, actor, data)));

export const updateMilestone = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateMilestone(runtime().db, actor, data.id, data.patch)));

export const removeMilestone = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.removeMilestone(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- portal links and messages

export const createPortalLink = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; label?: string }) => input)
  .handler(({ data }) =>
    act(async (actor) => {
      const link = await core.createPortalLink(runtime().db, actor, data.projectId, data.label);
      return { ...link, url: `${runtime().env.APP_BASE_URL}/portal/${link.token}` };
    }),
  );

export const revokePortalLink = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.revokePortalLink(runtime().db, actor, data.id)));

export const postMessage = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; body: string }) => input)
  .handler(({ data }) => act((actor) => core.postTeamMessage(runtime().db, actor, data.projectId, data.body)));

// ---------------------------------------------------------------- alerts as text (assistants)

export const getAlertLines = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const locale = requestLocale();
    return (await core.listAlerts(runtime().db, actor)).map((alert) => alertText(alert, locale));
  }),
);
