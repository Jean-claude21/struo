import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as core from '@struo/core';
import { z } from 'zod';
import { mailMessage } from '@/server/mail.server.ts';
import type { Runtime } from '@/server/runtime.server.ts';
import { translate } from '@/i18n/index.tsx';

/**
 * Spec 056: the founder's console through MCP (`/mcp/platform`, a platform key). The same figures and
 * gestures as /console, for the admin who created the key; a read-only key only gets the reading
 * tools (what a scheduled routine needs). Every gesture is journaled « via MCP ». Gestures that touch
 * money, a company or many people answer a preview first and act only when called again with
 * `confirmed: true` after the person said yes. Never offered: erasing a company, a company's own
 * data (sites, invoices…), secrets.
 */

type Level = 'read' | 'change' | 'commit';
interface Tool<I extends z.ZodRawShape = z.ZodRawShape> {
  name: string; level: Level; description: string; input: I;
  run(context: Context, input: z.infer<z.ZodObject<I>>): Promise<unknown>;
  preview?(context: Context, input: z.infer<z.ZodObject<I>>): Promise<unknown>;
}
interface Context { rt: Runtime; adminId: string }
const tool = <I extends z.ZodRawShape>(definition: Tool<I>) => definition as unknown as Tool;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).describe('YYYY-MM-DD');
const orgId = z.string().min(1).describe('The company id (from list_companies)');
const feature = z.enum(core.PLAN_FEATURES).describe('portal (client space), ai (assistant), mcp (MCP and API keys), whatsapp');
const planShape = {
  code: z.string().describe('Plan code (fixed once created): lowercase, digits, dashes'),
  name: z.string(), nameEn: z.string().nullable().optional(), tagline: z.string().nullable().optional(), taglineEn: z.string().nullable().optional(),
  bullets: z.string().nullable().optional().describe('What is included, one point per line; **bold** allowed'), bulletsEn: z.string().nullable().optional(),
  maxUsers: z.number().int().nullable().describe('null = unlimited'), maxProjects: z.number().int().nullable().describe('null = unlimited'),
  features: z.array(feature), highlight: z.boolean(), public: z.boolean(), position: z.number().int(),
};

const TOOLS: Tool[] = [
  // ---------------------------------------------------------------- briefs and figures
  tool({ name: 'platform_brief', level: 'read', input: {},
    description: 'The whole point in one call — for a weekly routine: monthly revenue per currency and by month (subscriptions and licences, demo excluded), paying companies and trials, the to-do list, product health (north star: validated field reports per week, activation, retention, trial-to-paid), the platform (jobs, failed sends, AI cost, demo funnel) and what changed over the last 7 days.',
    run: ({ rt }) => core.platformBrief(rt.owner) }),
  tool({ name: 'revenue', level: 'read', input: {},
    description: 'Monthly recurring revenue per currency (never added across currencies) and revenue per month and currency over 6 months, subscription payments and licences sold. Demo companies never count.',
    run: ({ rt }) => core.founderMoney(rt.owner) }),
  tool({ name: 'todo_today', level: 'read', input: {},
    description: 'What to handle today: follow-up reminders due, problems reported by users, subscriptions expired (30 days) or expiring (14 days), idle trials ending in 7 days, paying companies without a field report for 14 days, unhandled contact requests — with e-mail and phone to reach them.',
    run: ({ rt }) => core.founderTodo(rt.owner) }),
  tool({ name: 'product_health', level: 'read', input: {},
    description: 'Is Struo used? Validated field reports per week (12 weeks), activation (first report within 48 h, team invited, first invoice, client invited), usage per site lead, 4-week retention, trial-to-paid. Real companies only.',
    run: ({ rt }) => core.productHealth(rt.owner) }),
  tool({ name: 'platform_runs', level: 'read', input: {},
    description: 'Does the platform run? Each automatic job’s last run and failures, e-mails and phone notifications that failed (7 days), AI cost this month, demos opened by role, « create my space » clicks and sign-ups (30 days).',
    run: ({ rt }) => core.platformRuns(rt.owner) }),
  tool({ name: 'changes_since', level: 'read', input: { since: z.string().describe('ISO date or date-time') },
    description: 'What changed since a moment: new companies, licences sold, subscription payments, subscriptions expired, user feedback, contact requests, payments declared by clients. Use it in routines so nothing is reported twice.',
    run: ({ rt }, input) => core.changesSince(rt.owner, input.since) }),

  // ---------------------------------------------------------------- companies
  tool({ name: 'list_companies', level: 'read',
    input: {
      status: z.enum(['paying', 'trial', 'expired', 'suspended']).optional(), plan: z.string().optional(), expiresBefore: date.optional(),
      idleDays: z.number().int().min(1).max(365).optional().describe('no field report for at least this many days'), country: z.string().length(2).optional(),
      q: z.string().optional().describe('part of the name'), includeDemo: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional(),
    },
    description: 'Companies with their plan, period, usage (users, sites, reports over 30 days, last report), owner e-mail and getting-started steps. Demo companies excluded unless asked.',
    run: ({ rt }, input) => core.listCompaniesFor(rt.owner, input) }),
  tool({ name: 'company', level: 'read', input: { orgId },
    description: 'One company in full: plan and period, members, usage, licences, payments, getting-started steps, follow-up notes, features granted outside its plan.',
    async run({ rt }, input) {
      const [detail, notes, steps, grants] = await Promise.all([core.platformCompany(rt.owner, input.orgId), core.companyNotes(rt.owner, input.orgId), core.onboardingSteps(rt.owner, input.orgId), core.featureGrants(rt.owner, input.orgId)]);
      return { ...detail, notes, steps: steps[input.orgId] ?? null, grants };
    } }),
  tool({ name: 'list_requests', level: 'read', input: {},
    description: 'Contact requests from the public site (who, how to reach them, how many sites, message), unhandled first.',
    run: ({ rt }) => core.listContactRequests(rt.owner) }),
  tool({ name: 'list_feedback', level: 'read', input: {},
    description: 'Problems and ideas sent by users from the app (company, person, page, text), unhandled first.',
    run: ({ rt }) => core.listFeedback(rt.owner) }),
  tool({ name: 'add_note', level: 'change', input: { orgId, body: z.string().min(1).max(2000), remindOn: date.optional() },
    description: 'Adds a follow-up note on a company, with an optional reminder date (it then shows in todo_today that day).',
    run: async ({ rt, adminId }, input) => { await core.addCompanyNote(rt.owner, adminId, { orgId: input.orgId, body: input.body, nextOn: input.remindOn ?? null }); return { ok: true }; } }),
  tool({ name: 'mark_request_handled', level: 'change', input: { id: z.string().uuid() }, description: 'Marks a contact request handled.',
    run: async ({ rt, adminId }, input) => { await core.markContactHandled(rt.owner, input.id, adminId); return { ok: true }; } }),
  tool({ name: 'mark_feedback_handled', level: 'change', input: { id: z.string().uuid() }, description: 'Marks a user feedback handled.',
    run: async ({ rt, adminId }, input) => { await core.handleFeedback(rt.owner, adminId, input.id); return { ok: true }; } }),

  // ---------------------------------------------------------------- gestures on a company (confirmed)
  tool({ name: 'extend_trial', level: 'commit', input: { orgId, days: z.number().int().min(1).max(180) }, description: 'Extends a company’s trial by some days.',
    preview: async ({ rt }, input) => ({ company: (await core.platformCompany(rt.owner, input.orgId)).name, extendTrialByDays: input.days }),
    run: async ({ rt, adminId }, input) => { await core.extendTrial(rt.owner, adminId, input.orgId, input.days); return { ok: true }; } }),
  tool({ name: 'add_paid_months', level: 'commit', input: { orgId, months: z.number().int().min(1).max(60) }, description: 'Adds paid months to a company’s subscription (e.g. a payment received outside Chariow).',
    preview: async ({ rt }, input) => { const company = await core.platformCompany(rt.owner, input.orgId); return { company: company.name, plan: company.planCode, paidUntil: company.paidUntil, addMonths: input.months }; },
    run: async ({ rt, adminId }, input) => { await core.extendPaidPeriod(rt.owner, adminId, input.orgId, input.months); return { ok: true }; } }),
  tool({ name: 'set_company_plan', level: 'commit', input: { orgId, planCode: z.string() }, description: 'Moves a company to another plan (its features and limits change at once).',
    preview: async ({ rt }, input) => { const company = await core.platformCompany(rt.owner, input.orgId); return { company: company.name, from: company.planCode, to: input.planCode }; },
    run: async ({ rt, adminId }, input) => { await core.setCompanyPlan(rt.owner, input.orgId, input.planCode, adminId); return { ok: true }; } }),
  tool({ name: 'suspend_company', level: 'commit', input: { orgId, reason: z.string().min(2).max(300) }, description: 'Suspends a company (its members can no longer work), with the reason.',
    preview: async ({ rt }, input) => ({ company: (await core.platformCompany(rt.owner, input.orgId)).name, suspend: true, reason: input.reason }),
    run: async ({ rt, adminId }, input) => { await core.setCompanySuspended(rt.owner, adminId, input.orgId, true, input.reason); return { ok: true }; } }),
  tool({ name: 'reactivate_company', level: 'commit', input: { orgId }, description: 'Lifts a company’s suspension.',
    preview: async ({ rt }, input) => ({ company: (await core.platformCompany(rt.owner, input.orgId)).name, reactivate: true }),
    run: async ({ rt, adminId }, input) => { await core.setCompanySuspended(rt.owner, adminId, input.orgId, false, null); return { ok: true }; } }),
  tool({ name: 'grant_feature', level: 'commit', input: { orgId, feature, until: date.optional().describe('last day (empty: no end)'), reason: z.string().max(300).optional() },
    description: 'Gives one company a feature outside its plan (a pilot, a commercial gesture), until a date.',
    preview: async ({ rt }, input) => ({ company: (await core.platformCompany(rt.owner, input.orgId)).name, grant: input.feature, until: input.until ?? 'no end', reason: input.reason ?? null }),
    run: async ({ rt, adminId }, input) => { await core.grantFeature(rt.owner, adminId, input); return { ok: true }; } }),
  tool({ name: 'revoke_feature', level: 'commit', input: { orgId, feature }, description: 'Takes back a feature granted to one company (its plan’s features stay).',
    preview: async ({ rt }, input) => ({ company: (await core.platformCompany(rt.owner, input.orgId)).name, revoke: input.feature }),
    run: async ({ rt, adminId }, input) => { await core.revokeFeatureGrant(rt.owner, adminId, input.orgId, input.feature); return { ok: true }; } }),

  tool({ name: 'licence_settings', level: 'read', input: {}, description: 'How many days before the end of a trial or licence companies are warned, and how long the grace period lasts before read-only.',
    run: ({ rt }) => core.licenceSettings(rt.owner) }),
  tool({ name: 'set_licence_settings', level: 'commit', input: { warnDays: z.number().int().min(0).max(60), graceDays: z.number().int().min(0).max(90) },
    description: 'Changes the warning window and the grace period (applies to every company at once).',
    preview: async ({ rt }, input) => ({ before: await core.licenceSettings(rt.owner), after: input }),
    run: async ({ rt, adminId }, input) => core.setLicenceSettings(rt.owner, adminId, input) }),

  // ---------------------------------------------------------------- the offer
  tool({ name: 'list_plans', level: 'read', input: {},
    description: 'Every plan (hidden ones too): words FR/EN, limits, features, highlight, visibility, order, prices per currency, and how many companies are on it (paying, trial).',
    run: ({ rt }) => core.listEditablePlans(rt.owner) }),
  tool({ name: 'plan_history', level: 'read', input: { code: z.string() }, description: 'The previous versions of a plan (who, when, note), restorable with restore_plan_version.',
    run: async ({ rt }, input) => (await core.planRevisions(rt.owner, input.code)).map(({ snapshot, ...rest }) => ({ ...rest, snapshot })) }),
  tool({ name: 'plan_impact', level: 'read', input: planShape,
    description: 'What a plan change would do, without applying it: companies and paying ones touched, features lost or gained, companies above a new limit, a plan leaving the public offer. Call it before update_plan and show it.',
    run: ({ rt }, input) => core.planImpact(rt.owner, input) }),
  tool({ name: 'save_plan', level: 'commit', input: { ...planShape, note: z.string().max(300).optional() },
    description: 'Creates or changes a plan (all fields given). The previous version is kept. If paying companies lose something, the preview says so and the change needs the person’s explicit yes.',
    preview: async ({ rt }, input) => core.planImpact(rt.owner, input),
    run: async ({ rt, adminId }, input) => core.savePlan(rt.owner, adminId, input, { confirmCode: input.code, note: input.note ? `${input.note} (via MCP)` : 'via MCP' }) }),
  tool({ name: 'restore_plan_version', level: 'commit', input: { revisionId: z.number().int(), code: z.string() }, description: 'Puts a previous version of a plan back (the current one is kept first).',
    preview: async ({ rt }, input) => { const revision = (await core.planRevisions(rt.owner, input.code)).find((row) => row.id === input.revisionId); return revision ? { restore: input.code, version: revision.at, by: revision.adminName, note: revision.note } : { error: 'not_found' }; },
    run: async ({ rt, adminId }, input) => { await core.restorePlanRevision(rt.owner, adminId, input.revisionId, input.code); return { ok: true }; } }),
  tool({ name: 'set_price', level: 'commit', input: { planCode: z.string(), currencyCode: z.string().length(3), priceMinor: z.number().int().positive().nullable().describe('monthly price in minor units (XOF has none); null removes it (shown on quote)') },
    description: 'Sets a plan’s monthly price in one currency. Periods already paid never change.',
    preview: async (_context, input) => input,
    run: async ({ rt, adminId }, input) => { await core.setPlanPrice(rt.owner, input, adminId); return { ok: true }; } }),
  tool({ name: 'list_licence_products', level: 'read', input: {}, description: 'The Chariow products mapped to plans (months, label, buy link, description, highlight, order) and the licences redeemed.',
    run: async ({ rt }) => ({ products: await core.listLicenseProducts(rt.owner), redeemed: await core.listAllRedemptions(rt.owner) }) }),
  tool({ name: 'save_licence_product', level: 'commit',
    input: { productId: z.string(), planCode: z.string(), months: z.number().int().min(1).max(60), label: z.string(), buyUrl: z.string().url().optional(), description: z.string().max(2000).optional(), descriptionEn: z.string().max(2000).optional(), highlight: z.boolean().optional(), position: z.number().int().optional(), active: z.boolean().optional() },
    description: 'Creates or changes a Chariow licence product (what buyers see in Settings › Subscription).',
    preview: async (_context, input) => input,
    run: async ({ rt, adminId }, input) => { await core.saveLicenseProduct(rt.owner, adminId, input); return { ok: true }; } }),

  // ---------------------------------------------------------------- talking to every company
  tool({ name: 'list_announcements', level: 'read', input: {}, description: 'Announcements (live and past).', run: ({ rt }) => core.listAnnouncements(rt.owner) }),
  tool({ name: 'publish_announcement', level: 'commit',
    input: { title: z.string().min(1).max(120), body: z.string().max(1000).optional(), level: z.enum(['info', 'warning']).optional(), until: date.optional(), emailOwners: z.boolean().optional() },
    description: 'Shows a banner in the app for every company until a date; with emailOwners, also e-mails it once to every company owner.',
    preview: async (_context, input) => ({ ...input, emailOwners: Boolean(input.emailOwners) }),
    async run({ rt, adminId }, input) {
      const { id } = await core.createAnnouncement(rt.owner, adminId, { title: input.title, body: input.body ?? null, level: input.level ?? 'info', endsOn: input.until ?? null });
      let emailed = 0;
      if (input.emailOwners) {
        for (const recipient of (await core.announcementRecipients(rt.owner, id)) ?? []) {
          await rt.mailer.send(mailMessage(recipient.locale, recipient.email, input.title, {
            preheader: input.title, title: input.title, paragraphs: (input.body ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
            button: { label: translate(recipient.locale, 'announce.open'), url: `${rt.env.APP_BASE_URL}/app` },
          }, rt.env.APP_BASE_URL)).then(() => { emailed++; }).catch(() => undefined);
        }
      }
      return { id, emailed };
    } }),
  tool({ name: 'end_announcement', level: 'commit', input: { id: z.string().uuid() }, description: 'Takes an announcement down.',
    preview: async (_context, input) => input,
    run: async ({ rt, adminId }, input) => { await core.endAnnouncement(rt.owner, adminId, input.id); return { ok: true }; } }),
];

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify(error instanceof core.DomainError ? { error: error.code, ...error.params } : { error: 'generic' }) }],
});

export const PLATFORM_TOOL_NAMES = TOOLS.map((item) => item.name);

export function createPlatformMcpServer(rt: Runtime, key: { adminId: string; readOnly: boolean }): McpServer {
  const server = new McpServer(
    { name: 'struo-platform', version: process.env.APP_VERSION ?? '0.1.0' },
    {
      instructions:
        'The Struo platform console (the founder’s view across all companies). Start with platform_brief for a point, todo_today for what to do, changes_since in routines. Amounts are integers in minor units with their currency; never add amounts of different currencies. Tools that change a company, a plan, a price or write to everyone answer a preview first: show it and call again with confirmed: true only after the person’s explicit yes. Before save_plan, call plan_impact and show who is touched.',
    },
  );
  const context: Context = { rt, adminId: key.adminId };
  for (const item of TOOLS.filter((candidate) => !key.readOnly || candidate.level === 'read')) {
    const commits = item.level === 'commit';
    server.registerTool(item.name, {
      description: `${item.description}${commits ? ' Commits: answers a preview first; call again with confirmed: true after the person agrees.' : ''}`,
      inputSchema: commits ? { ...item.input, confirmed: z.boolean().optional().describe('true only after the person approved the preview') } : item.input,
      annotations: { readOnlyHint: item.level === 'read', destructiveHint: commits },
    }, async (args: Record<string, unknown>) => {
      try {
        const { confirmed, ...rest } = args as Record<string, unknown> & { confirmed?: boolean };
        const input = z.object(item.input).parse(rest);
        if (commits && confirmed !== true) {
          return text({ preview: item.preview ? await item.preview(context, input) : input, needsConfirmation: true, next: `Show this to the person. If they agree, call ${item.name} again with the same arguments and confirmed: true.` });
        }
        return text((await item.run(context, input)) ?? { ok: true });
      } catch (error) {
        if (error instanceof z.ZodError) return failure(new core.DomainError('invalid_input', 422, { detail: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }));
        return failure(error);
      }
    });
  }
  return server;
}
