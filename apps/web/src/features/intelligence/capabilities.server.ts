// The capabilities of Struo (spec 034): every ability declared once — name, group, what it does for a
// model, the permission it needs, how far an assistant may go alone with it, its input and what it
// runs. The in-app assistant, the MCP server and the documentation page are generated from this list.
//
// Autonomy (Kete's scale): 1 reads; 2 changes reversibly (runs, says what changed); 3 prepares a
// decision that commits and 4 is irreversible, money or sent outside: an assistant only proposes a
// draft that the person checks and validates.
import { randomUUID } from 'node:crypto';
import * as core from '@struo/core';
import type { Permission } from '@struo/core/permissions';
import { z } from 'zod';
import { translate } from '@/i18n/index.tsx';
import { alertText } from '@/server/jobs.server.ts';
import { invitationMail } from '@/server/mail.server.ts';
import { outboundAllowed } from '@/server/demo.server.ts';
import type { Runtime } from '@/server/runtime.server.ts';
import { forecast } from '@/server/weather.server.ts';

export type Autonomy = 1 | 2 | 3 | 4;
export const GROUPS = ['company', 'sites', 'clients', 'field', 'finance', 'documents', 'planning', 'expenses', 'portal', 'team'] as const;
export type Group = (typeof GROUPS)[number];

export interface CapabilityContext {
  rt: Runtime;
  actor: core.Actor;
  locale: 'fr' | 'en';
  /** A site by id or by its code (KC-01). */
  projectId(ref: string): Promise<string>;
}

export interface Source { kind: 'site' | 'invoice' | 'report' | 'incident' | 'document' | 'milestone' | 'client' | 'page'; label: string; href: string }

export interface Capability<I extends z.ZodObject = z.ZodObject> {
  name: string;
  group: Group;
  permission: Permission | null;
  autonomy: Autonomy;
  /** For a model: what it does and when to use it (English, as tool descriptions are). */
  description: string;
  input: I;
  run(context: CapabilityContext, input: z.output<I>): Promise<unknown>;
  /** What a person checks before validating a draft (levels 3 and 4). */
  summary?(context: CapabilityContext, input: z.output<I>): Promise<string>;
  /** Pages the result comes from, to open. */
  sources?(result: unknown, input: z.output<I>): Source[];
}

const define = <I extends z.ZodObject>(capability: Capability<I>) => capability as unknown as Capability;

/** The assistant sees what the person's screens show: no money for a role without finance rights. */
const MONEY_KEYS = new Set(['finance', 'budgetMinor', 'collectedPct', 'invoicedPct', 'invoiced', 'collected', 'spent', 'overdue', 'budget', 'cashMinor']);
function withoutMoney<T>(actor: core.Actor, value: T): T {
  if (core.can(actor.role, 'finance.read')) return value;
  const strip = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(strip);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).filter(([key]) => !MONEY_KEYS.has(key) && !/Minor$/u.test(key)).map(([key, inner]) => [key, strip(inner)]));
    return item;
  };
  const stripped = strip(value);
  // Hidden is not zero: say so where the figures were.
  return (stripped && typeof stripped === 'object' && !Array.isArray(stripped)
    ? { ...stripped, moneyHidden: 'Amounts and invoices are not visible to this role; never say they are zero.' }
    : stripped) as T;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).describe('YYYY-MM-DD');
const site = z.string().min(1).describe('The site: its code (KC-01) or id');
const money = z.number().int().positive().describe('Integer amount in minor units of the currency (XOF has none: 1 500 000 F = 1500000)');
const siteSource = (id: string, label: string): Source => ({ kind: 'site', label, href: `/app/projects/${id}` });
const fmt = (context: CapabilityContext, minor: number) => `${new Intl.NumberFormat(context.locale === 'en' ? 'en-GB' : 'fr-FR').format(minor)}`;

export const CAPABILITIES: Capability[] = [
  // ---------------------------------------------------------------- company
  define({
    name: 'context', group: 'company', permission: null, autonomy: 1, input: z.object({}),
    description: 'Call first: the company, your role, today, its currency, and what needs attention now (alerts, most severe first).',
    async run({ rt, actor, locale }) {
      const [settings, alerts, operations] = await Promise.all([core.getSettings(rt.db, actor), core.listAlerts(rt.db, actor), core.operationsSummary(rt.db, actor)]);
      return { company: settings.name, currency: settings.currencyCode, role: actor.role, today: new Date().toISOString().slice(0, 10),
        alerts: alerts.slice(0, 25).map((alert) => ({ severity: alert.severity, kind: alert.kind, projectId: alert.projectId, text: alertText(alert, locale) })), operations };
    },
  }),
  define({
    name: 'dashboard', group: 'company', permission: null, autonomy: 1, input: z.object({}),
    description: 'The figures of the company today: money to collect, overdue, due within 30 days, cash, current and expected margin, cash collected per month, client risk, sites with progress and health.',
    async run({ rt, actor }) {
      const canFinance = core.can(actor.role, 'finance.read');
      const [insights, finance, operations] = await Promise.all([
        core.dashboardInsights(rt.db, actor), canFinance ? core.financeSummary(rt.db, actor) : Promise.resolve(null), core.operationsSummary(rt.db, actor)]);
      return withoutMoney(actor, { finance, operations, cashByMonth: canFinance ? insights.cash : undefined, clientRisk: canFinance ? insights.risk : undefined,
        sites: insights.sites.map(({ coverId: _cover, latitude: _lat, longitude: _lng, ...rest }) => rest) });
    },
  }),
  define({
    name: 'indicators', group: 'company', permission: null, autonomy: 1,
    input: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional() }),
    description: 'The indicators of a period (default: last 30 days): money (invoiced before VAT, collected, spent, collection rate, DSO, payment delay, receivable, overdue, cash, runway, backlog, retentions, CPI — only for finance roles), planning (SPI, late milestones, on time), field (reports, review time, incidents, checklists, deliveries), compliance, per-site SPI/CPI, and 12 months of trend.',
    run: ({ rt, actor }, input) => {
      const to = input.to ?? new Date().toISOString().slice(0, 10);
      const from = input.from ?? new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      return core.companyKpis(rt.db, actor, { from, to });
    },
  }),
  define({
    name: 'search', group: 'company', permission: null, autonomy: 1, input: z.object({ query: z.string().min(2) }),
    description: 'Searches sites, clients, invoices, documents and people by words.',
    run: ({ rt, actor }, input) => core.searchCompany(rt.db, actor, input.query),
  }),
  define({
    name: 'recent_activity', group: 'company', permission: null, autonomy: 1, input: z.object({ limit: z.number().int().min(1).max(60).optional() }),
    description: 'What happened lately in the company (journal): who did what, when.',
    run: ({ rt, actor }, input) => core.recentActivity(rt.db, actor, input.limit ?? 30),
  }),

  // ---------------------------------------------------------------- sites
  define({
    name: 'list_sites', group: 'sites', permission: null, autonomy: 1,
    input: z.object({ q: z.string().optional(), status: z.enum(core.PROJECT_STATUSES).optional() }),
    description: 'Sites with client, dates, budget, progress, collected share, health and site lead. Filters: q (words), status.',
    run: async ({ rt, actor }, input) => withoutMoney(actor, await core.listProjects(rt.db, actor, input)),
    sources: (result) => (result as core.ProjectRow[]).slice(0, 6).map((row) => siteSource(row.id, `${row.code} · ${row.name}`)),
  }),
  define({
    name: 'get_site', group: 'sites', permission: null, autonomy: 1, input: z.object({ site }),
    description: 'One site in full: phases with progress and dates, finance, compliance, latest reports, milestones, invoices, open incidents.',
    async run({ rt, actor, projectId }, input) {
      const id = await projectId(input.site);
      const [detail, reports, milestones, invoices, incidents] = await Promise.all([
        core.getProject(rt.db, actor, id), core.listReports(rt.db, actor, { projectId: id, limit: 8 }), core.listMilestones(rt.db, actor, { projectId: id }),
        core.can(actor.role, 'finance.read') ? core.listInvoices(rt.db, actor, { projectId: id }) : Promise.resolve([]),
        core.listIncidents(rt.db, actor, { projectId: id })]);
      return withoutMoney(actor, { ...detail, ...(core.can(actor.role, 'finance.read') ? {} : { invoices: undefined }), reports: reports.map(({ photos, ...rest }) => ({ ...rest, photos: photos.length })), milestones, invoices,
        openIncidents: incidents.filter((incident) => incident.status !== 'resolved') });
    },
    sources: (result) => { const row = result as { id: string; code: string; name: string }; return [siteSource(row.id, `${row.code} · ${row.name}`)]; },
  }),
  define({
    name: 'create_site', group: 'sites', permission: 'projects.write', autonomy: 3,
    input: z.object({
      name: z.string().min(1), code: z.string().optional(), client: z.string().optional().describe('Client name (must exist) or id'),
      location: z.string().optional(), startDate: date.optional(), endDate: date.optional(), budgetMinor: z.number().int().min(0).optional(),
      status: z.enum(core.PROJECT_STATUSES).optional(),
    }),
    description: 'Creates a site (code, name, client, place, dates, budget). The trade phases are added automatically.',
    async run({ rt, actor }, input) {
      const clientId = input.client ? await clientRef(rt, actor, input.client) : null;
      return core.createProject(rt.db, actor, { ...input, client: undefined, clientId });
    },
    summary: async (context, input) => `${input.code ?? ''} ${input.name}${input.client ? ` · ${input.client}` : ''}${input.budgetMinor ? ` · ${fmt(context, input.budgetMinor)}` : ''}${input.startDate ? ` · ${input.startDate} → ${input.endDate ?? '?'}` : ''}`,
  }),
  define({
    name: 'update_site', group: 'sites', permission: 'projects.write', autonomy: 2,
    input: z.object({
      site, name: z.string().optional(), status: z.enum(core.PROJECT_STATUSES).optional(), location: z.string().optional(),
      startDate: date.optional(), endDate: date.optional(), budgetMinor: z.number().int().min(0).optional(),
    }),
    description: 'Changes a site: name, status (pending, active, suspended, done), place, dates or budget.',
    async run({ rt, actor, projectId }, { site: ref, ...patch }) {
      const id = await projectId(ref);
      await core.updateProject(rt.db, actor, id, patch);
      return { ok: true, changed: Object.keys(patch) };
    },
  }),
  define({
    name: 'set_phase', group: 'sites', permission: 'projects.write', autonomy: 2,
    input: z.object({ site, phase: z.string().describe('Phase name (Fondations) or id'), progressPct: z.number().int().min(0).max(100).optional(),
      startDate: date.optional(), endDate: date.optional(), budgetMinor: z.number().int().min(0).optional() }),
    description: 'Sets a phase of a site: validated progress, planned window, budget.',
    async run({ rt, actor, projectId }, { site: ref, phase, ...patch }) {
      const detail = await core.getProject(rt.db, actor, await projectId(ref));
      const found = detail.phases.find((item) => item.id === phase || item.name.toLowerCase() === phase.toLowerCase());
      if (!found) throw new core.DomainError('not_found', 404);
      await core.updatePhase(rt.db, actor, found.id, patch);
      return { ok: true, phase: found.name };
    },
  }),

  // ---------------------------------------------------------------- clients
  define({
    name: 'list_clients', group: 'clients', permission: null, autonomy: 1, input: z.object({ q: z.string().optional() }),
    description: 'Clients with contacts and number of sites.',
    run: ({ rt, actor }, input) => core.listClients(rt.db, actor, input.q),
  }),
  define({
    name: 'create_client', group: 'clients', permission: 'clients.write', autonomy: 2,
    input: z.object({ name: z.string().min(1), kind: z.enum(['individual', 'company', 'public']).optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional() }),
    description: 'Adds a client (person, company or public body) with contacts.',
    run: ({ rt, actor }, input) => core.createClient(rt.db, actor, input),
  }),
  define({
    name: 'update_client', group: 'clients', permission: 'clients.write', autonomy: 2,
    input: z.object({ client: z.string().describe('Client name or id'), name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), address: z.string().optional(), notes: z.string().optional() }),
    description: 'Changes a client\'s name or contacts.',
    async run({ rt, actor }, { client, ...patch }) {
      const id = await clientRef(rt, actor, client);
      await core.updateClient(rt.db, actor, id, patch);
      return { ok: true };
    },
  }),

  // ---------------------------------------------------------------- field
  define({
    name: 'list_reports', group: 'field', permission: null, autonomy: 1,
    input: z.object({ site: site.optional(), status: z.enum(['pending', 'validated', 'rejected']).optional(), limit: z.number().int().min(1).max(50).optional() }),
    description: 'Field reports (note, phase progress, photos count, author, status). Pending ones wait for an engineer.',
    async run({ rt, actor, projectId }, input) {
      const reports = await core.listReports(rt.db, actor, { status: input.status, projectId: input.site ? await projectId(input.site) : undefined, limit: input.limit ?? 20 });
      return reports.map(({ photos, ...rest }) => ({ ...rest, photos: photos.length }));
    },
    sources: (result) => (result as { id: string; projectCode: string; takenAt: string }[]).slice(0, 4).map((row) => ({ kind: 'report', label: `${row.projectCode} · ${String(row.takenAt).slice(0, 10)}`, href: `/app/field?report=${row.id}` })),
  }),
  define({
    name: 'review_report', group: 'field', permission: 'field.review', autonomy: 2,
    input: z.object({ reportId: z.string().uuid(), decision: z.enum(['validated', 'rejected']), note: z.string().optional() }),
    description: 'Validates a field report (its progress becomes the phase\'s) or rejects it with a note for the site lead.',
    run: ({ rt, actor }, input) => core.reviewReport(rt.db, actor, input.reportId, { decision: input.decision, note: input.note ?? null }),
  }),
  define({
    name: 'list_incidents', group: 'field', permission: null, autonomy: 1,
    input: z.object({ site: site.optional(), status: z.enum(['open', 'in_progress', 'resolved']).optional() }),
    description: 'Incidents (defect, weather, material delay, accident…) with priority, decision, who acts and by when.',
    async run({ rt, actor, projectId }, input) {
      return core.listIncidents(rt.db, actor, { status: input.status, projectId: input.site ? await projectId(input.site) : undefined });
    },
  }),
  define({
    name: 'report_incident', group: 'field', permission: 'field.report', autonomy: 2,
    input: z.object({ site, kind: z.enum(core.INCIDENT_KINDS), priority: z.enum(core.PRIORITIES), description: z.string().min(3) }),
    description: 'Reports an incident on a site.',
    async run({ rt, actor, projectId }, input) {
      return core.reportIncident(rt.db, actor, { id: randomUUID(), projectId: await projectId(input.site), kind: input.kind, priority: input.priority, description: input.description });
    },
  }),
  define({
    name: 'update_incident', group: 'field', permission: 'field.review', autonomy: 2,
    input: z.object({ incidentId: z.string().uuid(), status: z.enum(['open', 'in_progress', 'resolved']).optional(), decision: z.string().optional(), action: z.string().optional(),
      assignee: z.string().optional().describe('Name of the member who acts'), dueOn: date.optional(), impactDays: z.number().int().min(0).max(365).optional(), resolutionNote: z.string().optional() }),
    description: 'Follows an incident: decision, action, who acts, by when, impact in days, then resolution.',
    async run({ rt, actor }, { incidentId, assignee, ...patch }) {
      const assigneeId = assignee ? (await core.listMembers(rt.db, actor)).find((member) => member.name.toLowerCase().includes(assignee.toLowerCase()))?.userId ?? null : undefined;
      await core.updateIncident(rt.db, actor, incidentId, { ...patch, ...(assigneeId !== undefined ? { assigneeId } : {}) });
      return { ok: true };
    },
  }),
  define({
    name: 'list_checklists', group: 'field', permission: null, autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Checklists filled on site (safety, before pouring, deliveries, end of day) with what was not done.',
    async run({ rt, actor, projectId }, input) {
      return core.listChecklistRuns(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined, limit: 40 });
    },
  }),
  define({
    name: 'list_deliveries', group: 'field', permission: null, autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Deliveries received on site (supplier, item, quantity, conform or with reserve).',
    async run({ rt, actor, projectId }, input) { return core.listDeliveries(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined }); },
  }),
  define({
    name: 'list_signatures', group: 'field', permission: null, autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Signed reports (handover, delivery, inspection): who signed, as what, when, any reserve.',
    async run({ rt, actor, projectId }, input) { return core.listSignatures(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined }); },
  }),
  define({
    name: 'site_weather', group: 'field', permission: null, autonomy: 1, input: z.object({ site }),
    description: 'The 3-day forecast on a site (rain probability, temperature): useful before pouring concrete.',
    async run({ rt, actor, projectId }, input) {
      const detail = await core.getProject(rt.db, actor, await projectId(input.site));
      if (detail.latitude == null || detail.longitude == null) return { days: [], note: 'no coordinates' };
      return { site: detail.code, days: await forecast(detail.latitude, detail.longitude) };
    },
  }),

  // ---------------------------------------------------------------- finance
  define({
    name: 'finance_summary', group: 'finance', permission: 'finance.read', autonomy: 1, input: z.object({}),
    description: 'Budget, invoiced, collected, to collect, overdue, cash, retentions, margins of the company.',
    run: ({ rt, actor }) => core.financeSummary(rt.db, actor),
  }),
  define({
    name: 'list_invoices', group: 'finance', permission: 'finance.read', autonomy: 1, input: z.object({ site: site.optional(), open: z.boolean().optional() }),
    description: 'Invoices with net amount, paid, balance, due date and days overdue. open=true: only those not fully paid.',
    async run({ rt, actor, projectId }, input) {
      return core.listInvoices(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined, open: input.open });
    },
    sources: (result) => (result as { id: string; number: string }[]).slice(0, 5).map((row) => ({ kind: 'invoice', label: row.number, href: `/app/finance?invoice=${row.id}` })),
  }),
  define({
    name: 'receivables_aging', group: 'finance', permission: 'finance.read', autonomy: 1, input: z.object({}),
    description: 'Unpaid amounts by age (not due, 1-30, 31-60, 61-90, over 90 days).',
    run: ({ rt, actor }) => core.receivablesAging(rt.db, actor),
  }),
  define({
    name: 'list_payments', group: 'finance', permission: 'finance.read', autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Payments received (date, amount, method, reference, invoice).',
    async run({ rt, actor, projectId }, input) { return core.listPayments(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined, limit: 60 }); },
  }),
  define({
    name: 'progress_statement', group: 'finance', permission: 'finance.read', autonomy: 1, input: z.object({ site }),
    description: 'The next progress statement of a site, computed from validated progress: earned, already invoiced, suggested amount and advance deduction.',
    async run({ rt, actor, projectId }, input) { return core.progressStatement(rt.db, actor, await projectId(input.site)); },
  }),
  define({
    name: 'create_invoice', group: 'finance', permission: 'finance.write', autonomy: 3,
    input: z.object({ site, kind: z.enum(core.INVOICE_KINDS), amountMinor: money.describe('Amount before VAT, minor units'), label: z.string().optional(),
      deductionMinor: z.number().int().min(0).optional(), issuedOn: date.optional(), dueOn: date }),
    description: 'Issues an invoice (advance, progress statement or final) on a site. VAT and retention come from the site.',
    async run({ rt, actor, projectId }, input) { return core.createInvoice(rt.db, actor, { ...input, site: undefined, projectId: await projectId(input.site) }); },
    summary: async (context, input) => `${input.site} · ${input.kind} · ${fmt(context, input.amountMinor)} HT${input.deductionMinor ? ` − ${fmt(context, input.deductionMinor)}` : ''} · ${input.dueOn}${input.label ? ` · ${input.label}` : ''}`,
  }),
  define({
    name: 'prepare_invoice', group: 'finance', permission: 'finance.write', autonomy: 2,
    input: z.object({ site, kind: z.enum(core.INVOICE_KINDS), fromProgress: z.boolean().optional().describe('Prefill one progress line per lot from validated progress (default true for progress statements)'),
      label: z.string().optional(),
      items: z.array(z.object({ designation: z.string().min(1), unit: z.string().optional(), quantity: z.number().min(0), unitPriceMinor: z.number().int().min(0) })).optional()
        .describe('Priced lines to add (quantity can have decimals)') }),
    description: 'Creates an invoice DRAFT with detailed lines (progress lots from validated progress, and/or priced items). Nothing is issued: tell the person to open the draft (link returned), check the lines and press « Émettre » there, or ask you to issue it (issue_invoice).',
    async run({ rt, actor, projectId }, input) {
      const id = await projectId(input.site);
      const { id: invoiceId } = await core.createDraftInvoice(rt.db, actor, { projectId: id, kind: input.kind, label: input.label ?? null, fromProgress: input.fromProgress ?? input.kind === 'progress' });
      let edit = await core.getInvoiceForEdit(rt.db, actor, invoiceId);
      if (input.items?.length) {
        edit = await core.saveDraftInvoice(rt.db, actor, invoiceId, { lines: [
          ...edit.lines.map(({ kind, section, designation, unit, quantityMilli, unitPriceMinor, phaseId, contractMinor, cumulativeBps, previousMinor }) => ({ kind, section, designation, unit, quantityMilli, unitPriceMinor, phaseId, contractMinor, cumulativeBps, previousMinor })),
          ...input.items.map((item) => ({ kind: 'item' as const, designation: item.designation, unit: item.unit ?? null, quantityMilli: Math.round(item.quantity * 1000), unitPriceMinor: item.unitPriceMinor })),
        ] });
      }
      return { draftId: invoiceId, editor: `/app/invoices/${invoiceId}`, lines: edit.lines.length, amountMinor: edit.amountMinor, netMinor: edit.netMinor, deductionMinor: edit.deductionMinor };
    },
    sources: (result) => [{ kind: 'invoice', label: 'Brouillon de facture', href: (result as { editor: string }).editor }],
  }),
  define({
    name: 'issue_invoice', group: 'finance', permission: 'finance.write', autonomy: 4, input: z.object({ draftId: z.string().uuid() }),
    description: 'Issues an invoice draft: it gets the next number of the company series and is frozen.',
    run: ({ rt, actor }, input) => core.issueInvoice(rt.db, actor, input.draftId),
    async summary({ rt, actor, locale }, input) {
      const edit = await core.getInvoiceForEdit(rt.db, actor, input.draftId);
      return `${edit.projectCode} · ${edit.kind} · ${edit.lines.length} ligne(s) · net ${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR').format(edit.netMinor)} ${edit.currencyCode}`;
    },
  }),
  define({
    name: 'record_payment', group: 'finance', permission: 'finance.write', autonomy: 4,
    input: z.object({ site, invoiceId: z.string().uuid().optional(), amountMinor: money, method: z.enum(core.PAYMENT_METHODS), receivedOn: date.optional(), reference: z.string().optional() }),
    description: 'Records a payment received (mobile money, transfer, cheque, cash) on a site, against an invoice if given.',
    async run({ rt, actor, projectId }, input) { return core.recordPayment(rt.db, actor, { ...input, site: undefined, projectId: await projectId(input.site) }); },
    summary: async (context, input) => `${input.site} · ${fmt(context, input.amountMinor)} · ${input.method}${input.reference ? ` · ${input.reference}` : ''}${input.receivedOn ? ` · ${input.receivedOn}` : ''}`,
  }),
  define({
    name: 'draft_reminder', group: 'finance', permission: 'finance.read', autonomy: 1,
    input: z.object({ invoiceId: z.string().uuid(), kind: z.enum(['reminder', 'formal_notice']) }),
    description: 'Writes the text of a reminder or a formal notice for an unpaid invoice, from its real figures. Nothing is sent.',
    async run({ rt, actor, locale }, input) {
      const invoice = (await core.listInvoices(rt.db, actor, {})).find((row) => row.id === input.invoiceId);
      if (!invoice) throw new core.DomainError('not_found', 404);
      const settings = await core.getSettings(rt.db, actor);
      const facts = { company: settings.name, client: invoice.clientName ?? '', invoice: invoice.number, site: invoice.projectName,
        balance: `${fmt({ locale } as CapabilityContext, invoice.balanceMinor)} ${invoice.currencyCode}`, due: invoice.dueOn, overdueDays: String(invoice.overdueDays) };
      if (!rt.drafter.configured) {
        return { text: translate(locale, `drafts.${input.kind}`, { number: invoice.number, issuedOn: invoice.issuedOn, project: invoice.projectName, balance: facts.balance, dueOn: invoice.dueOn, company: settings.name }) };
      }
      return { text: await rt.drafter.draft({ kind: input.kind, locale, facts }) };
    },
  }),
  define({
    name: 'record_reminder', group: 'finance', permission: 'finance.write', autonomy: 3,
    input: z.object({ invoiceId: z.string().uuid(), kind: z.enum(['reminder', 'formal_notice']), channel: z.enum(['email', 'whatsapp', 'phone', 'letter']), body: z.string().optional() }),
    description: 'Records that a reminder or a formal notice was sent for an invoice (by e-mail, WhatsApp, phone or letter).',
    run: ({ rt, actor }, input) => core.recordReminder(rt.db, actor, input.invoiceId, input),
    summary: async (_context, input) => `${input.kind} · ${input.channel}`,
  }),
  define({
    name: 'cancel_invoice', group: 'finance', permission: 'finance.write', autonomy: 4, input: z.object({ invoiceId: z.string().uuid() }),
    description: 'Cancels an issued invoice that received no payment.',
    run: ({ rt, actor }, input) => core.cancelInvoice(rt.db, actor, input.invoiceId),
    summary: async (_context, input) => input.invoiceId,
  }),

  // ---------------------------------------------------------------- documents
  define({
    name: 'list_documents', group: 'documents', permission: null, autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Compliance documents (contract, service order, permit, insurance…) with status and expiry.',
    async run({ rt, actor, projectId }, input) { return core.listDocuments(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined }); },
    sources: (result) => (result as { id: string; title: string }[]).slice(0, 4).map((row) => ({ kind: 'document', label: row.title, href: `/app/documents?doc=${row.id}` })),
  }),
  define({
    name: 'compliance', group: 'documents', permission: null, autonomy: 1, input: z.object({}),
    description: 'Compliance rate of every site and what is missing, to fix or expired.',
    run: ({ rt, actor }) => core.complianceByProject(rt.db, actor),
  }),
  define({
    name: 'update_document', group: 'documents', permission: 'documents.write', autonomy: 2,
    input: z.object({ documentId: z.string().uuid(), status: z.enum(core.DOCUMENT_STATUSES).optional(), reference: z.string().optional(), issuedOn: date.optional(), expiresOn: date.optional(), note: z.string().optional() }),
    description: 'Updates a document: status (missing, pending, valid, to_fix), reference, dates.',
    async run({ rt, actor }, { documentId, ...patch }) { await core.updateDocument(rt.db, actor, documentId, patch); return { ok: true }; },
  }),

  // ---------------------------------------------------------------- planning
  define({
    name: 'list_milestones', group: 'planning', permission: null, autonomy: 1, input: z.object({ site: site.optional(), late: z.boolean().optional() }),
    description: 'Milestones with planned and actual dates, status and delay. late=true: only late ones.',
    async run({ rt, actor, projectId }, input) { return core.listMilestones(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined, late: input.late }); },
    sources: () => [{ kind: 'page', label: 'Planning', href: '/app/planning' }],
  }),
  define({
    name: 'gantt', group: 'planning', permission: null, autonomy: 1, input: z.object({}),
    description: 'Every open site in time: dates, progress, phases with their windows, milestones and the dependencies between milestones.',
    run: ({ rt, actor }) => core.gantt(rt.db, actor),
  }),
  define({
    name: 'add_milestone', group: 'planning', permission: 'planning.write', autonomy: 2,
    input: z.object({ site, name: z.string().min(1), category: z.enum(core.MILESTONE_CATEGORIES).optional(), plannedOn: date, clientValidation: z.boolean().optional() }),
    description: 'Adds a milestone to a site.',
    async run({ rt, actor, projectId }, input) { return core.addMilestone(rt.db, actor, { ...input, site: undefined, projectId: await projectId(input.site) }); },
  }),
  define({
    name: 'move_milestone', group: 'planning', permission: 'planning.write', autonomy: 2,
    input: z.object({ milestoneId: z.string().uuid(), plannedOn: date }),
    description: 'Moves a milestone; the milestones waiting for it are pushed in cascade and listed with their former dates.',
    run: ({ rt, actor }, input) => core.moveMilestone(rt.db, actor, input.milestoneId, { plannedOn: input.plannedOn }),
  }),
  define({
    name: 'mark_milestone_reached', group: 'planning', permission: 'planning.write', autonomy: 2,
    input: z.object({ milestoneId: z.string().uuid(), actualOn: date.optional() }),
    description: 'Marks a milestone reached (today unless a date is given).',
    async run({ rt, actor }, input) { await core.updateMilestone(rt.db, actor, input.milestoneId, { actualOn: input.actualOn ?? new Date().toISOString().slice(0, 10) }); return { ok: true }; },
  }),
  define({
    name: 'set_milestone_dependencies', group: 'planning', permission: 'planning.write', autonomy: 2,
    input: z.object({ milestoneId: z.string().uuid(), dependsOn: z.array(z.object({ id: z.string().uuid(), lagDays: z.number().int().min(0).max(365).optional() })) }),
    description: 'Says which milestones this one waits for (any site), with a minimum gap in days. Loops are refused.',
    async run({ rt, actor }, input) { await core.setMilestoneDependencies(rt.db, actor, input.milestoneId, { dependsOn: input.dependsOn }); return { ok: true }; },
  }),

  // ---------------------------------------------------------------- expenses
  define({
    name: 'list_expenses', group: 'expenses', permission: null, autonomy: 1, input: z.object({ site: site.optional() }),
    description: 'Expenses (date, category, label, supplier, amount).',
    async run({ rt, actor, projectId }, input) { return withoutMoney(actor, await core.listExpenses(rt.db, actor, { projectId: input.site ? await projectId(input.site) : undefined, limit: 100 })); },
  }),
  define({
    name: 'add_expense', group: 'expenses', permission: 'expenses.write', autonomy: 2,
    input: z.object({ site, category: z.enum(core.EXPENSE_CATEGORIES), label: z.string().min(1), supplier: z.string().optional(), amountMinor: money, spentOn: date.optional() }),
    description: 'Records an expense on a site.',
    async run({ rt, actor, projectId }, input) { return core.addExpense(rt.db, actor, { ...input, site: undefined, projectId: await projectId(input.site) }); },
  }),
  define({
    name: 'margins', group: 'expenses', permission: 'finance.read', autonomy: 1, input: z.object({}),
    description: 'Margin and cost performance of every site, and by segment (residential, commercial…).',
    async run({ rt, actor }) { const [bySite, bySegment] = await Promise.all([core.marginByProject(rt.db, actor), core.marginBySegment(rt.db, actor)]); return { bySite, bySegment }; },
  }),

  // ---------------------------------------------------------------- client spaces
  define({
    name: 'list_client_spaces', group: 'portal', permission: 'portal.manage', autonomy: 1, input: z.object({ site }),
    description: 'The client space links of a site: who it is for, what it shows, whether it was opened.',
    async run({ rt, actor, projectId }, input) { return core.listPortalLinksFull(rt.db, actor, await projectId(input.site)); },
  }),
  define({
    name: 'invite_client', group: 'portal', permission: 'portal.manage', autonomy: 4,
    input: z.object({ site, contactName: z.string().min(2), contactEmail: z.string().email(), contactPhone: z.string().optional() }),
    description: 'Invites the client of a site to their space by e-mail (photos, planning, invoices, documents, messages; access confirmed by an e-mail code).',
    async run({ rt, actor, projectId, locale }, input) {
      const id = await projectId(input.site);
      const [project, settings] = await Promise.all([core.getProject(rt.db, actor, id), core.getSettings(rt.db, actor)]);
      for (const old of await core.listPortalLinksFull(rt.db, actor, id)) if (!old.revokedAt) await core.revokePortalLink(rt.db, actor, old.id);
      const link = await core.createPortalLink(rt.db, actor, id, input.contactName);
      await core.updatePortalLink(rt.db, actor, link.id, { contactName: input.contactName, contactEmail: input.contactEmail, contactPhone: input.contactPhone ?? null,
        requireCode: true, showPhotos: true, showPlanning: true, showFinance: true, showDocuments: true, showMessages: true, invited: true });
      const url = `${rt.env.APP_BASE_URL}/portal/${link.token}`;
      if (await outboundAllowed(rt, actor.orgId)) await rt.mailer.send({ to: input.contactEmail, subject: translate(locale, 'clientInvite.subject', { project: project.name, company: settings.name }),
        text: translate(locale, 'clientInvite.message', { name: input.contactName, project: project.name, company: settings.name, url }) });
      return { sent: true, to: input.contactEmail };
    },
    summary: async (_context, input) => `${input.site} · ${input.contactName} <${input.contactEmail}>`,
  }),
  define({
    name: 'list_messages', group: 'portal', permission: null, autonomy: 1, input: z.object({ site }),
    description: 'The conversation with the client of a site.',
    async run({ rt, actor, projectId }, input) { return core.listMessages(rt.db, actor, await projectId(input.site)); },
  }),
  define({
    name: 'message_client', group: 'portal', permission: 'messages.write', autonomy: 4, input: z.object({ site, text: z.string().min(1).max(4000) }),
    description: 'Writes to the client of a site in their space (they see it).',
    async run({ rt, actor, projectId }, input) { await core.postTeamMessage(rt.db, actor, await projectId(input.site), input.text); return { ok: true }; },
    summary: async (_context, input) => `${input.site} · « ${input.text.slice(0, 160)} »`,
  }),

  // ---------------------------------------------------------------- team
  define({
    name: 'list_team', group: 'team', permission: null, autonomy: 1, input: z.object({}),
    description: 'The members of the company and their role.',
    run: ({ rt, actor }) => core.listMembers(rt.db, actor),
  }),
  define({
    name: 'invite_member', group: 'team', permission: 'members.manage', autonomy: 4,
    input: z.object({ email: z.string().email(), role: z.enum(['admin', 'engineer', 'site_lead', 'accountant']) }),
    description: 'Invites someone to the company with a role (an e-mail with the link is sent).',
    async run({ rt, actor }, input) {
      const invitation = await core.inviteMember(rt.db, actor, input);
      const settings = await core.getSettings(rt.db, actor);
      const url = `${rt.env.APP_BASE_URL}/invite/${invitation.id}`;
      const inviter = (await rt.db.query<{ name: string }>('select name from "user" where id = $1', [actor.userId])).rows[0]?.name ?? settings.name;
      if (await outboundAllowed(rt, actor.orgId)) await rt.mailer.send(invitationMail(settings.locale, { to: invitation.email, org: settings.name, inviter, role: input.role, url }, rt.env.APP_BASE_URL))
        .catch((error: unknown) => console.error('[mail] invitation', error));
      return { invited: invitation.email };
    },
    summary: async (_context, input) => `${input.email} · ${input.role}`,
  }),
];

async function clientRef(rt: Runtime, actor: core.Actor, ref: string): Promise<string> {
  if (/^[0-9a-f-]{36}$/iu.test(ref)) return ref;
  const found = (await core.listClients(rt.db, actor, ref)).find((client) => client.name.toLowerCase().includes(ref.toLowerCase()));
  if (!found) throw new core.DomainError('not_found', 404);
  return found.id;
}

export const capabilityByName = new Map(CAPABILITIES.map((capability) => [capability.name, capability]));

/** The capabilities a role may use (a capability it may not use is not offered at all). */
export const capabilitiesFor = (role: core.Actor['role']) =>
  CAPABILITIES.filter((capability) => !capability.permission || core.can(role, capability.permission));

export function contextFor(rt: Runtime, actor: core.Actor, locale: 'fr' | 'en'): CapabilityContext {
  return {
    rt, actor, locale,
    async projectId(ref) {
      if (/^[0-9a-f-]{36}$/iu.test(ref)) return ref;
      const match = (await core.listProjects(rt.db, actor, { q: ref })).find((row) => row.code.toLowerCase() === ref.toLowerCase() || row.name.toLowerCase() === ref.toLowerCase())
        ?? (await core.listProjects(rt.db, actor, { q: ref }))[0];
      if (!match) throw new core.DomainError('not_found', 404);
      return match.id;
    },
  };
}

/** The JSON schema of a capability's input (for a model or a copilot). */
export const inputSchema = (capability: Capability) => z.toJSONSchema(capability.input, { target: 'draft-7' }) as Record<string, unknown>;

/** What the documentation page shows (no function, no secret). */
export function catalog() {
  return CAPABILITIES.map((capability) => {
    const schema = inputSchema(capability) as { properties?: Record<string, { type?: string; description?: string; enum?: string[] }>; required?: string[] };
    return {
      name: capability.name, group: capability.group, autonomy: capability.autonomy, permission: capability.permission,
      roles: capability.permission ? ([...core.ROLES].filter((role) => core.can(role, capability.permission!))) : [...core.ROLES],
      inputs: Object.entries(schema.properties ?? {}).map(([key, value]) => ({
        name: key, type: value.enum ? value.enum.join(' | ') : value.type ?? 'object', required: (schema.required ?? []).includes(key), description: value.description ?? '',
      })),
    };
  });
}
