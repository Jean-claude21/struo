import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as core from '@struo/core';
import { z } from 'zod';
import { alertText } from '@/server/jobs.server.ts';
import type { Runtime } from '@/server/runtime.server.ts';

/**
 * The MCP door (spec 011): a few everyday tools of their own, then one family per domain called
 * with an `action` and its `args` (pattern of Jarvis' tool groups). Every call acts as the key's
 * member, under row-level security and the same permission checks as the web pages; figures come
 * from the database, never from the model.
 */
export const TOOL_GROUPS = {
  projects: {
    about: 'Projects and clients: create or update a project, set a phase progress, list or create clients.',
    actions: ['create_project', 'update_project', 'set_phase_progress', 'list_clients', 'create_client'],
  },
  field: {
    about: 'Field reports and incidents: list reports, validate or reject a report, list or resolve incidents.',
    actions: ['list_reports', 'review_report', 'list_incidents', 'resolve_incident'],
  },
  finance: {
    about: 'Money (integers in minor units of the currency): summary, invoices, receivables aging, issue an invoice, record a payment received, record a reminder sent.',
    actions: ['summary', 'list_invoices', 'receivables', 'create_invoice', 'record_payment', 'record_reminder'],
  },
  documents: {
    about: 'Compliance documents: list them with their status and expiry, compliance per project, update a document.',
    actions: ['list_documents', 'compliance', 'update_document'],
  },
  planning: {
    about: 'Milestones: list (or only the late ones), add, update (set actualOn when reached), the consolidated Gantt.',
    actions: ['list_milestones', 'add_milestone', 'update_milestone', 'gantt'],
  },
  expenses: {
    about: 'Costs: list expenses, add an expense, margins per project and per segment.',
    actions: ['list_expenses', 'add_expense', 'margins'],
  },
} as const;

type Json = Record<string, unknown>;
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(error instanceof core.DomainError ? { error: error.code, ...error.params } : { error: 'generic' }),
    },
  ],
});

export function createStruoMcpServer(rt: Runtime, actor: core.Actor, locale: 'fr' | 'en'): McpServer {
  const db = rt.db;
  const server = new McpServer(
    { name: 'struo', version: process.env.APP_VERSION ?? '0.1.0' },
    {
      instructions:
        'Struo holds one construction company: projects, field reports, invoices and payments, documents, milestones and costs. Call `context` first. Amounts are integers in minor units with their currency (XOF has no decimals). Never compute a total yourself: read it from a tool. Before any write (invoice, payment, reminder, status), show the person what you will do and wait for their yes.',
    },
  );
  const safe = <T>(work: () => Promise<T>) => work().then(text, failure);

  // A project by id or by its code (P001).
  const projectId = async (ref: string) => {
    if (/^[0-9a-f-]{36}$/iu.test(ref)) return ref;
    const match = (await core.listProjects(db, actor, { q: ref })).find((p) => p.code.toLowerCase() === ref.toLowerCase());
    if (!match) throw new core.DomainError('not_found', 404);
    return match.id;
  };

  server.registerTool(
    'context',
    {
      description: 'Call first: the company, your role, today, and what needs attention now (alerts, most severe first).',
      annotations: { readOnlyHint: true },
    },
    () =>
      safe(async () => {
        const [settings, alerts, operations] = await Promise.all([
          core.getSettings(db, actor),
          core.listAlerts(db, actor),
          core.operationsSummary(db, actor),
        ]);
        return {
          company: settings.name, currency: settings.currencyCode, role: actor.role, today: new Date().toISOString().slice(0, 10),
          alerts: alerts.map((alert) => ({ ...alert, text: alertText(alert, locale) })), operations,
        };
      }),
  );

  server.registerTool(
    'list_projects',
    {
      description: 'Projects with progress, collected share and financial health. Filters: q (text), status (pending, active, suspended, done).',
      inputSchema: { q: z.string().optional(), status: z.enum(['pending', 'active', 'suspended', 'done']).optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => safe(() => core.listProjects(db, actor, args)),
  );

  server.registerTool(
    'get_project',
    {
      description: 'One project (by id or code such as P001): phases, finance, compliance, recent reports, invoices, milestones.',
      inputSchema: { project: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ project }) =>
      safe(async () => {
        const id = await projectId(project);
        const [detail, reports, milestones, invoices] = await Promise.all([
          core.getProject(db, actor, id),
          core.listReports(db, actor, { projectId: id, limit: 10 }),
          core.listMilestones(db, actor, { projectId: id }),
          core.can(actor.role, 'finance.read') ? core.listInvoices(db, actor, { projectId: id }) : Promise.resolve([]),
        ]);
        return { ...detail, reports, milestones, invoices };
      }),
  );

  server.registerTool(
    'list_alerts',
    { description: 'Every alert of the company today, most severe first, with a sentence for each.', annotations: { readOnlyHint: true } },
    () => safe(async () => (await core.listAlerts(db, actor)).map((alert) => ({ ...alert, text: alertText(alert, locale) }))),
  );

  const groupInput = (actions: readonly string[]) => ({
    action: z.enum(actions as [string, ...string[]]),
    args: z.record(z.string(), z.unknown()).optional(),
  });

  const run: Record<keyof typeof TOOL_GROUPS, (action: string, args: Json) => Promise<unknown>> = {
    projects: async (action, args) => {
      if (action === 'create_project') return core.createProject(db, actor, args);
      if (action === 'update_project') return core.updateProject(db, actor, await projectId(String(args.project)), args.patch);
      if (action === 'set_phase_progress') return core.updatePhase(db, actor, String(args.phaseId), { progressPct: args.progressPct });
      if (action === 'list_clients') return core.listClients(db, actor, typeof args.q === 'string' ? args.q : undefined);
      return core.createClient(db, actor, args);
    },
    field: async (action, args) => {
      if (action === 'list_reports') return core.listReports(db, actor, { status: args.status as string | undefined, projectId: args.project ? await projectId(String(args.project)) : undefined });
      if (action === 'review_report') return core.reviewReport(db, actor, String(args.reportId), args);
      if (action === 'list_incidents') return core.listIncidents(db, actor, { status: args.status as string | undefined });
      return core.resolveIncident(db, actor, String(args.incidentId));
    },
    finance: async (action, args) => {
      if (action === 'summary') return core.financeSummary(db, actor);
      if (action === 'list_invoices') return core.listInvoices(db, actor, { projectId: args.project ? await projectId(String(args.project)) : undefined, open: args.open === true });
      if (action === 'receivables') return core.receivablesAging(db, actor);
      if (action === 'create_invoice') return core.createInvoice(db, actor, { ...args, projectId: await projectId(String(args.project ?? args.projectId)) });
      if (action === 'record_payment') return core.recordPayment(db, actor, { ...args, projectId: await projectId(String(args.project ?? args.projectId)) });
      return core.recordReminder(db, actor, String(args.invoiceId), args);
    },
    documents: async (action, args) => {
      if (action === 'list_documents') return core.listDocuments(db, actor, { projectId: args.project ? await projectId(String(args.project)) : undefined });
      if (action === 'compliance') return core.complianceByProject(db, actor);
      return core.updateDocument(db, actor, String(args.documentId), args.patch);
    },
    planning: async (action, args) => {
      if (action === 'list_milestones') return core.listMilestones(db, actor, { projectId: args.project ? await projectId(String(args.project)) : undefined, late: args.late === true });
      if (action === 'add_milestone') return core.addMilestone(db, actor, { ...args, projectId: await projectId(String(args.project ?? args.projectId)) });
      if (action === 'update_milestone') return core.updateMilestone(db, actor, String(args.milestoneId), args.patch);
      return core.gantt(db, actor);
    },
    expenses: async (action, args) => {
      if (action === 'list_expenses') return core.listExpenses(db, actor, { projectId: args.project ? await projectId(String(args.project)) : undefined });
      if (action === 'add_expense') return core.addExpense(db, actor, { ...args, projectId: await projectId(String(args.project ?? args.projectId)) });
      const [byProject, bySegment] = await Promise.all([core.marginByProject(db, actor), core.marginBySegment(db, actor)]);
      return { byProject, bySegment };
    },
  };

  for (const [name, group] of Object.entries(TOOL_GROUPS) as [keyof typeof TOOL_GROUPS, (typeof TOOL_GROUPS)[keyof typeof TOOL_GROUPS]][]) {
    server.registerTool(
      name,
      {
        description: `${group.about} Actions: ${group.actions.join(', ')}. Pass the action's arguments in \`args\` (projects by id or code).`,
        inputSchema: groupInput(group.actions),
      },
      ({ action, args }) => safe(async () => (await run[name](action, args ?? {})) ?? { ok: true }),
    );
  }

  return server;
}
