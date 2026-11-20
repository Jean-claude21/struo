// Server functions of the office (/app). Each one resolves the acting member on the server, then
// calls the core; no rule lives here (constitution II).
import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { translate } from '@/i18n/index.tsx';
import { guarded, requestLocale, requireActor } from '@/server/context.server.ts';
import { alertText } from '@/server/jobs.server.ts';
import { outboundAllowed } from '@/server/demo.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { forecast, RAIN_LIMIT } from '@/server/weather.server.ts';

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
    const canFinance = core.can(actor.role, 'finance.read');
    const [settings, finance, operations, alerts, projects, activity, subscription, insights, aging, payments, members] = await Promise.all([
      core.getSettings(db, actor),
      canFinance ? core.financeSummary(db, actor) : Promise.resolve(null),
      core.operationsSummary(db, actor),
      core.listAlerts(db, actor),
      core.listProjects(db, actor),
      core.recentActivity(db, actor, 15),
      core.getSubscription(db, actor),
      core.dashboardInsights(db, actor),
      canFinance ? core.receivablesAging(db, actor) : Promise.resolve(null),
      canFinance ? core.listPayments(db, actor, { limit: 6 }) : Promise.resolve([]),
      core.listMembers(db, actor),
    ]);
    const me = members.find((member) => member.userId === actor.userId);
    // Spec 047: who is on the sites today.
    const crew = await core.crewToday(db, actor, new Date().toISOString().slice(0, 10));
    const weather = await Promise.all(insights.sites.filter((site) => site.status === 'active' && site.latitude !== null && site.longitude !== null)
      .map(async (site) => ({ projectId: site.id, code: site.code, location: site.location, days: await forecast(site.latitude!, site.longitude!) })));
    return {
      role: actor.role, name: me?.name ?? '', settings, finance, operations, alerts, projects, activity, subscription,
      insights: canFinance ? insights : { ...insights, cash: [], risk: [] }, aging, payments, weather, rainLimit: RAIN_LIMIT, crew,
    };
  }),
);

// ---------------------------------------------------------------- projects and clients

export const getProjects = createServerFn({ method: 'GET' })
  .validator((input: { q?: string; status?: string; typeId?: string } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const [projects, configuration, clients, members, settings, covers] = await Promise.all([
        core.listProjects(db, actor, data),
        core.getConfiguration(db, actor),
        core.listClients(db, actor),
        core.listMembers(db, actor),
        core.getSettings(db, actor),
        core.projectCovers(db, actor),
      ]);
      return { role: actor.role, projects, configuration, clients, members, currency: settings.currencyCode, covers };
    }),
  );

export const getProjectPage = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const project = await core.getProject(db, actor, data.id);
      // Spec 045: money is shown to the roles whose screens include finance.
      const canFinance = core.sees(actor.role, 'finance');
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
          core.listPortalLinksFull(db, actor, data.id),
          core.getConfiguration(db, actor),
          core.listClients(db, actor),
          core.listMembers(db, actor),
        ]);
      const [settings, tasks, notes, subcontracts, labour] = await Promise.all([
        core.getSettings(db, actor), core.listTasks(db, actor, { projectId: data.id }), core.listNotes(db, actor, data.id),
        core.listSubcontracts(db, actor, { projectId: data.id }), core.labourByProject(db, actor),
      ]);
      return {
        role: actor.role, userId: actor.userId, project, reports, incidents, invoices, payments, documents, milestones,
        expenses, messages, links, configuration, clients, members, companyName: settings.name, tasks, notes, subcontracts, labour: labour.find((row) => row.projectId === data.id) ?? null, canRates: core.can(actor.role, 'crew.rates'),
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
  act(async (actor) => {
    const { db } = runtime();
    const canFinance = core.can(actor.role, 'finance.read');
    const [clients, projects, insights, invoices, settings] = await Promise.all([
      core.listClients(db, actor),
      core.listProjects(db, actor),
      canFinance ? core.dashboardInsights(db, actor) : Promise.resolve(null),
      canFinance ? core.listInvoices(db, actor) : Promise.resolve([]),
      core.getSettings(db, actor),
    ]);
    return {
      role: actor.role, clients, currency: settings.currencyCode, risk: insights?.risk ?? [],
      projects: projects.map((project) => ({ id: project.id, code: project.code, name: project.name, clientId: project.clientId, status: project.status, progressPct: project.progressPct })),
      invoices: invoices.filter((invoice) => invoice.status === 'issued' && invoice.balanceMinor > 0)
        .map((invoice) => ({ id: invoice.id, number: invoice.number, projectId: invoice.projectId, balanceMinor: invoice.balanceMinor, overdueDays: invoice.overdueDays })),
    };
  }),
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

export const updateIncident = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateIncident(runtime().db, actor, data.id, data.patch)));

/** The engineer's field desk: reports, incidents, checklists, deliveries and signatures. */
export const getFieldDesk = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [reports, incidents, checklists, deliveries, signatures, members] = await Promise.all([
      core.listReports(db, actor, { limit: 150 }),
      core.listIncidents(db, actor, {}),
      core.listChecklistRuns(db, actor, { limit: 80 }),
      core.listDeliveries(db, actor),
      core.listSignatures(db, actor),
      core.listMembers(db, actor),
    ]);
    return {
      role: actor.role, userId: actor.userId, reports, incidents, checklists, deliveries, signatures,
      members: members.map((member) => ({ userId: member.userId, name: member.name, role: member.role })),
    };
  }),
);

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

// ---------------------------------------------------------------- indicators and reports (spec 039)

const periodOf = (input: { from?: string; to?: string }) => {
  const today = new Date().toISOString().slice(0, 10);
  const valid = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : undefined);
  const to = valid(input.to) ?? today;
  const from = valid(input.from) ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
};

export const getIndicators = createServerFn({ method: 'GET' })
  .validator((input: { from?: string; to?: string } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const period = periodOf(data);
      const [kpis, settings] = await Promise.all([core.companyKpis(db, actor, period), core.getSettings(db, actor)]);
      return { kpis, currency: settings.currencyCode, role: actor.role };
    }),
  );

export const getReport = createServerFn({ method: 'GET' })
  .validator((input: { from?: string; to?: string } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const period = periodOf(data);
      const [kpis, activity, settings, look] = await Promise.all([
        core.companyKpis(db, actor, period), core.periodActivity(db, actor, period), core.getSettings(db, actor), core.getInvoiceSettings(db, actor)]);
      return { kpis, activity, company: settings.name, currency: settings.currencyCode, orgId: actor.orgId, logoKey: look.logoKey, generatedAt: new Date().toISOString() };
    }),
  );

// ---------------------------------------------------------------- invoice drafts (spec 035)

export const createDraftInvoice = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; kind: string; fromProgress?: boolean; label?: string }) => input)
  .handler(({ data }) => act((actor) => core.createDraftInvoice(runtime().db, actor, data)));

export const getInvoiceEditor = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const [invoice, settings] = await Promise.all([core.getInvoiceForEdit(db, actor, data.id), core.getInvoiceSettings(db, actor)]);
      return { invoice, settings, role: actor.role };
    }),
  );

export const saveDraftInvoice = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.saveDraftInvoice(runtime().db, actor, data.id, data.patch)));

export const issueInvoice = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.issueInvoice(runtime().db, actor, data.id)));

export const deleteDraftInvoice = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.deleteDraftInvoice(runtime().db, actor, data.id)));

export const getInvoiceSettings = createServerFn({ method: 'GET' }).handler(() => act((actor) => core.getInvoiceSettings(runtime().db, actor)));

/**
 * What the appearance preview shows (spec 036): the company's latest invoice with lines (else its
 * latest invoice), or a fixed example when it has none yet. Its settings come separately: the
 * preview applies the ones being edited.
 */
export const getInvoicePreview = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [settings, company] = await Promise.all([core.getInvoiceSettings(db, actor), core.getSettings(db, actor)]);
    const rows = await core.listInvoices(db, actor, {});
    const candidates = rows.filter((row) => row.status !== 'cancelled');
    for (const row of candidates.slice(0, 12)) {
      const doc = await core.invoiceDocument(db, actor, row.id);
      if (doc.lines.length) return { settings, orgId: actor.orgId, doc, sample: false };
    }
    if (candidates[0]) return { settings, orgId: actor.orgId, doc: await core.invoiceDocument(db, actor, candidates[0].id), sample: false };
    const today = new Date().toISOString().slice(0, 10);
    const doc = {
      number: `${settings.numberPrefix}-${today.slice(0, 4)}-${'1'.padStart(settings.numberPadding, '0')}`, kind: 'progress', status: 'issued', label: 'Situation n°2',
      issued_on: today, due_on: today, currency_code: company.currencyCode, amount_minor: 9_500_000, vat_bps: 1800, vat_minor: 1_710_000, total_minor: 11_210_000,
      retention_bps: 500, retention_minor: 560_500, deduction_minor: 1_000_000, net_minor: 9_649_500, paid_minor: 0, balance_minor: 9_649_500,
      project_code: 'P001', project_name: 'Villa R+1', location: 'Lomé', client_name: 'M. Client Exemple', client_address: 'Quartier, Lomé',
      client_email: 'client@example.test', client_phone: '+228 90 00 00 00', company_name: company.name, contract_ref: 'Marché n°12/2026', order_ref: null,
      notes: null, terms: settings.paymentTerms, vat_exempt_reason: null, extra_fields: [],
      lines: [
        { kind: 'text', designation: 'Lot 1 — Gros œuvre', unit: null, quantity_milli: 0, unit_price_minor: 0, contract_minor: 0, cumulative_bps: 0, previous_minor: 0, amount_minor: 0 },
        { kind: 'progress', designation: 'Fondations', unit: null, quantity_milli: 0, unit_price_minor: 0, contract_minor: 10_000_000, cumulative_bps: 10_000, previous_minor: 6_000_000, amount_minor: 4_000_000 },
        { kind: 'progress', designation: 'Élévation', unit: null, quantity_milli: 0, unit_price_minor: 0, contract_minor: 20_000_000, cumulative_bps: 2_750, previous_minor: 0, amount_minor: 5_500_000 },
      ],
      adjustments: [],
    };
    return { settings, orgId: actor.orgId, doc, sample: true };
  }),
);

export const updateInvoiceSettings = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) => act((actor) => core.updateInvoiceSettings(runtime().db, actor, data)));

export const getProgressStatement = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.progressStatement(runtime().db, actor, data.id)));

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
      // A demo company never sends anything (spec 042): the reminder is recorded only.
      const outbound = await outboundAllowed(runtime(), actor.orgId);
      if (outbound && data.send && data.channel === 'email' && invoice.client_email) {
        const subject = data.body.split('\n')[0]?.replace(/^(Objet|Subject)\s*:\s*/u, '') ?? invoice.number;
        await mailer.send({ to: invoice.client_email, subject, text: data.body });
      }
      if (outbound && data.send && data.channel === 'whatsapp' && invoice.client_phone) await messenger.send(invoice.client_phone, data.body);
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
    const [documents, compliance, configuration, projects, files] = await Promise.all([
      core.listDocuments(db, actor),
      core.complianceByProject(db, actor),
      core.getConfiguration(db, actor),
      core.listProjects(db, actor),
      core.fileLibrary(db, actor),
    ]);
    return {
      role: actor.role, documents, compliance, docTypes: configuration.docTypes, files,
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
    return { role: actor.role, gantt: gantt.sites, dependencies: gantt.dependencies, late, projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name })) };
  }),
);

export const addMilestone = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.addMilestone(runtime().db, actor, data)));

export const updateMilestone = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateMilestone(runtime().db, actor, data.id, data.patch)));

export const moveMilestone = createServerFn({ method: 'POST' })
  .validator((input: { id: string; plannedOn: string }) => input)
  .handler(({ data }) => act((actor) => core.moveMilestone(runtime().db, actor, data.id, { plannedOn: data.plannedOn })));

export const restoreMilestoneDates = createServerFn({ method: 'POST' })
  .validator((input: { items: { id: string; plannedOn: string }[] }) => input)
  .handler(({ data }) => act((actor) => core.restoreMilestoneDates(runtime().db, actor, data)));

export const setMilestoneDependencies = createServerFn({ method: 'POST' })
  .validator((input: { id: string; dependsOn: { id: string; lagDays: number }[] }) => input)
  .handler(({ data }) => act((actor) => core.setMilestoneDependencies(runtime().db, actor, data.id, { dependsOn: data.dependsOn })));

export const updatePhaseDates = createServerFn({ method: 'POST' })
  .validator((input: { id: string; startDate: string | null; endDate: string | null }) => input)
  .handler(({ data }) => act((actor) => core.updatePhase(runtime().db, actor, data.id, { startDate: data.startDate, endDate: data.endDate })));

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

/**
 * Invites the project's client (spec 022): a fresh link (older ones are revoked), who it is for, what
 * the client sees, then the e-mail is sent here; WhatsApp opens on the sender's phone with the
 * message ready (no SMS).
 */
export const inviteClient = createServerFn({ method: 'POST' })
  .validator((input: {
    projectId: string; channel: 'whatsapp' | 'email' | 'link'; contactName?: string; contactEmail?: string; contactPhone?: string;
    show: { photos: boolean; planning: boolean; finance: boolean; documents: boolean; messages: boolean };
  }) => input)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, env, mailer } = runtime();
      const locale = requestLocale();
      const project = await core.getProject(db, actor, data.projectId);
      const settings = await core.getSettings(db, actor);
      for (const old of await core.listPortalLinksFull(db, actor, data.projectId)) {
        if (!old.revokedAt) await core.revokePortalLink(db, actor, old.id);
      }
      const link = await core.createPortalLink(db, actor, data.projectId, data.contactName || undefined);
      await core.updatePortalLink(db, actor, link.id, {
        contactName: data.contactName || null, contactEmail: data.contactEmail || null, contactPhone: data.contactPhone || null, requireCode: true,
        showPhotos: data.show.photos, showPlanning: data.show.planning, showFinance: data.show.finance, showDocuments: data.show.documents,
        showMessages: data.show.messages, invited: true,
      });
      const url = `${env.APP_BASE_URL}/portal/${link.token}`;
      const message = translate(locale, 'clientInvite.message', { name: data.contactName || '', project: project.name, company: settings.name, url });
      const outbound = await outboundAllowed(runtime(), actor.orgId);
      if (data.channel === 'email') {
        if (!data.contactEmail) throw new core.DomainError('invalid_input', 422, { field: 'contactEmail', detail: '' });
        if (outbound) await mailer.send({ to: data.contactEmail, subject: translate(locale, 'clientInvite.subject', { project: project.name, company: settings.name }), text: message });
      }
      const phone = (data.contactPhone ?? '').replace(/[^\d]/gu, '');
      const whatsappUrl = data.channel === 'whatsapp' && phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
      return { url, message, whatsappUrl, mailSent: outbound && data.channel === 'email' && mailer.configured };
    }, 'portal.manage'),
  );

export const revokePortalLink = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.revokePortalLink(runtime().db, actor, data.id)));

export const postMessage = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; body: string }) => input)
  .handler(({ data }) => act((actor) => core.postTeamMessage(runtime().db, actor, data.projectId, data.body)));

// ---------------------------------------------------------------- tasks, internal thread, versions (spec 046)

export const getTasks = createServerFn({ method: 'GET' })
  .validator((input: { mine?: boolean; open?: boolean } | undefined) => input ?? {})
  .handler(({ data }) =>
    act(async (actor) => {
      const { db } = runtime();
      const [tasks, projects, members] = await Promise.all([
        core.listTasks(db, actor, { assigneeId: data.mine ? actor.userId : undefined, open: data.open }),
        core.listProjects(db, actor, {}),
        core.listMembers(db, actor),
      ]);
      return { role: actor.role, userId: actor.userId, tasks, projects, members };
    }),
  );

export const createTask = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.createTask(runtime().db, actor, data)));

export const updateTask = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateTask(runtime().db, actor, data.id, data.patch)));

export const removeTask = createServerFn({ method: 'POST' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.removeTask(runtime().db, actor, data.id)));

export const postNote = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; body: string }) => input)
  .handler(({ data }) => act((actor) => core.postNote(runtime().db, actor, data)));

export const getDocumentVersions = createServerFn({ method: 'GET' })
  .validator(idOf)
  .handler(({ data }) => act((actor) => core.listDocumentVersions(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- crew and subcontracts (spec 047)

const isoDay = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };

export const getCrew = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db } = runtime();
    const [workers, attendance, subcontracts, projects, labour, settings] = await Promise.all([
      core.listWorkers(db, actor),
      core.listAttendance(db, actor, { from: isoDay(-13), to: isoDay(0) }),
      core.listSubcontracts(db, actor),
      core.listProjects(db, actor, {}),
      core.labourByProject(db, actor),
      core.getSettings(db, actor),
    ]);
    return {
      role: actor.role, workers, attendance, subcontracts, labour, currency: settings.currencyCode, today: isoDay(0),
      projects: projects.filter((project) => project.status !== 'done').map((project) => ({ id: project.id, code: project.code, name: project.name })),
      canWrite: core.can(actor.role, 'crew.write'), canRates: core.can(actor.role, 'crew.rates'), canPay: core.can(actor.role, 'expenses.write'),
    };
  }, 'crew.write'),
);

export const saveWorker = createServerFn({ method: 'POST' })
  .validator((input: { id: string | null; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.saveWorker(runtime().db, actor, data.id, data.patch)));

export const setAttendance = createServerFn({ method: 'POST' })
  .validator((input: { projectId: string; day: string; workerIds: string[] }) => input)
  .handler(({ data }) => act((actor) => core.recordAttendance(runtime().db, actor, { ...data, replace: true })));

export const createSubcontract = createServerFn({ method: 'POST' })
  .validator(any)
  .handler(({ data }) => act((actor) => core.createSubcontract(runtime().db, actor, data)));

export const updateSubcontract = createServerFn({ method: 'POST' })
  .validator((input: { id: string; patch: Record<string, unknown> }) => input)
  .handler(({ data }) => act((actor) => core.updateSubcontract(runtime().db, actor, data.id, data.patch)));

export const paySubcontract = createServerFn({ method: 'POST' })
  .validator((input: { id: string; amountMinor: number }) => input)
  .handler(({ data }) => act((actor) => core.paySubcontract(runtime().db, actor, data.id, { amountMinor: data.amountMinor })));

// ---------------------------------------------------------------- alerts as text (assistants)

export const getAlertLines = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const locale = requestLocale();
    return (await core.listAlerts(runtime().db, actor)).map((alert) => alertText(alert, locale));
  }),
);
