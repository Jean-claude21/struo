import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
// Kept here, not imported from finance.ts (which imports this module): avoids a load cycle.
const INVOICE_KINDS = ['advance', 'progress', 'final'] as const;

/**
 * Invoices as a building company issues them (spec 035): a draft is written — priced lines,
 * progress lines per lot, text lines, rates, complementary deductions, references — then issued,
 * which gives it the next number of the company's series and freezes it. Every amount is computed
 * by the database (generated columns); this module only says what the lines are.
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const text = (max: number) => z.string().trim().max(max).nullable().optional();

// ---------------------------------------------------------------- settings

export const INVOICE_TEMPLATES = ['classic', 'modern', 'compact'] as const;
export interface CustomField { label: string; value: string }

export interface InvoiceSettings {
  numberPrefix: string; numberPadding: number; numberYearly: boolean; dueDays: number;
  legalName: string | null; taxId: string | null; tradeRegister: string | null; address: string | null; phone: string | null; email: string | null;
  bankDetails: string | null; mobileMoney: string | null; paymentTerms: string | null; footer: string | null;
  // How it looks (spec 036).
  logoKey: string | null; template: (typeof INVOICE_TEMPLATES)[number]; accentColor: string | null; logoPosition: 'left' | 'center' | 'right';
  logoHeight: number; font: 'sans' | 'serif'; showAmountWords: boolean; showSignature: boolean; signerName: string | null; signerTitle: string | null;
  showClientContact: boolean; showSite: boolean; showPayments: boolean; showUnitColumns: boolean;
  titles: Partial<Record<'advance' | 'progress' | 'final', string>>; customFields: CustomField[];
  // The client report (spec 049).
  reportIntro: string | null; reportPhotos: number; reportShowProgress: boolean; reportShowMilestones: boolean; reportShowChanges: boolean; reportWeekly: boolean; reportAutoSend: boolean;
}

const SETTINGS_COLUMNS = {
  numberPrefix: 'number_prefix', numberPadding: 'number_padding', numberYearly: 'number_yearly', dueDays: 'due_days',
  legalName: 'legal_name', taxId: 'tax_id', tradeRegister: 'trade_register', address: 'address', phone: 'phone', email: 'email',
  bankDetails: 'bank_details', mobileMoney: 'mobile_money', paymentTerms: 'payment_terms', footer: 'footer',
  template: 'template', accentColor: 'accent_color', logoPosition: 'logo_position', logoHeight: 'logo_height', font: 'font',
  showAmountWords: 'show_amount_words', showSignature: 'show_signature', signerName: 'signer_name', signerTitle: 'signer_title',
  showClientContact: 'show_client_contact', showSite: 'show_site', showPayments: 'show_payments', showUnitColumns: 'show_unit_columns',
  titles: 'titles', customFields: 'custom_fields',
  reportIntro: 'report_intro', reportPhotos: 'report_photos', reportShowProgress: 'report_show_progress', reportShowMilestones: 'report_show_milestones',
  reportShowChanges: 'report_show_changes', reportWeekly: 'report_weekly', reportAutoSend: 'report_auto_send',
} as const;
/** Columns the settings form writes (the logo has its own door). */
type Writable = Exclude<keyof InvoiceSettings, 'logoKey'>;
const JSON_COLUMNS = new Set<string>(['titles', 'customFields']);

const DEFAULT_SETTINGS: InvoiceSettings = {
  numberPrefix: 'F', numberPadding: 4, numberYearly: true, dueDays: 30, legalName: null, taxId: null, tradeRegister: null, address: null,
  phone: null, email: null, bankDetails: null, mobileMoney: null, paymentTerms: null, footer: null,
  logoKey: null, template: 'classic', accentColor: null, logoPosition: 'left', logoHeight: 56, font: 'sans', showAmountWords: true, showSignature: false,
  signerName: null, signerTitle: null, showClientContact: true, showSite: true, showPayments: true, showUnitColumns: true, titles: {}, customFields: [],
  reportIntro: null, reportPhotos: 8, reportShowProgress: true, reportShowMilestones: true, reportShowChanges: true, reportWeekly: false, reportAutoSend: false,
};

export async function readSettings(tx: Tx, orgId: string): Promise<InvoiceSettings> {
  const select = [...Object.entries(SETTINGS_COLUMNS), ['logoKey', 'logo_key']].map(([key, column]) => `${column} as "${key}"`).join(', ');
  const { rows } = await tx.query<InvoiceSettings>(`select ${select} from invoice_settings where org_id = $1`, [orgId]);
  return rows[0] ? { ...DEFAULT_SETTINGS, ...rows[0] } : DEFAULT_SETTINGS;
}

export async function getInvoiceSettings(db: Db, actor: Actor): Promise<InvoiceSettings> {
  return asActor(db, actor, (tx) => readSettings(tx, actor.orgId));
}

const settingsInput = z.object({
  numberPrefix: z.string().trim().min(1).max(12).regex(/^[\p{L}\p{N}_/-]+$/u),
  numberPadding: z.number().int().min(2).max(8),
  numberYearly: z.boolean(),
  dueDays: z.number().int().min(0).max(365),
  legalName: text(200), taxId: text(60), tradeRegister: text(80), address: text(400), phone: text(60), email: text(200),
  bankDetails: text(600), mobileMoney: text(300), paymentTerms: text(600), footer: text(600),
  template: z.enum(INVOICE_TEMPLATES), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).nullable(), logoPosition: z.enum(['left', 'center', 'right']),
  logoHeight: z.number().int().min(24).max(160), font: z.enum(['sans', 'serif']), showAmountWords: z.boolean(), showSignature: z.boolean(),
  signerName: text(120), signerTitle: text(120), showClientContact: z.boolean(), showSite: z.boolean(), showPayments: z.boolean(), showUnitColumns: z.boolean(),
  titles: z.object({ advance: z.string().trim().max(80).optional(), progress: z.string().trim().max(80).optional(), final: z.string().trim().max(80).optional() }),
  customFields: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(200) })).max(12),
  reportIntro: text(1000), reportPhotos: z.number().int().min(0).max(24), reportShowProgress: z.boolean(), reportShowMilestones: z.boolean(),
  reportShowChanges: z.boolean(), reportWeekly: z.boolean(), reportAutoSend: z.boolean(),
}).partial();

export async function updateInvoiceSettings(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'finance.write');
  const data = parse(settingsInput, input);
  await asActor(db, actor, async (tx) => {
    const before = await readSettings(tx, actor.orgId);
    const next = { ...before, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])) } as InvoiceSettings;
    const keys = Object.keys(SETTINGS_COLUMNS) as Writable[];
    await tx.query(
      `insert into invoice_settings (org_id, ${keys.map((key) => SETTINGS_COLUMNS[key]).join(', ')}, updated_at)
       values ($1, ${keys.map((key, index) => `$${index + 2}${JSON_COLUMNS.has(key) ? '::jsonb' : ''}`).join(', ')}, now())
       on conflict (org_id) do update set ${keys.map((key) => `${SETTINGS_COLUMNS[key]} = excluded.${SETTINGS_COLUMNS[key]}`).join(', ')}, updated_at = now()`,
      [actor.orgId, ...keys.map((key) => (JSON_COLUMNS.has(key) ? JSON.stringify(next[key]) : next[key]))],
    );
    await journal(tx, actor, 'invoice.settings', actor.orgId, before, next);
  });
}

/**
 * The company's logo (spec 036): stored by the application, its key kept here; the same logo is
 * printed on invoices and shown in client spaces. `null` removes it.
 */
export async function setCompanyLogo(db: Db, actor: Actor, key: string | null, publicPath: string | null): Promise<void> {
  ensure(actor, 'finance.write');
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into invoice_settings (org_id, logo_key) values ($1, $2) on conflict (org_id) do update set logo_key = excluded.logo_key, updated_at = now()`,
      [actor.orgId, key]);
    await tx.query('update organization set logo = $2 where id = $1', [actor.orgId, publicPath]);
    await journal(tx, actor, key ? 'company.logo' : 'company.logo_remove', actor.orgId, null, null);
  });
}

/** Where a company's logo is stored (public: printed on invoices). */
export async function companyLogoKey(db: Db, orgId: string): Promise<string | null> {
  const { rows } = await db.query<{ key: string | null }>('select struo_org_logo($1) as key', [orgId]);
  return rows[0]?.key ?? null;
}

/** The next number of the company's series: prefix, year (when yearly), counter with its padding. */
export async function nextInvoiceNumber(tx: Tx, orgId: string, issuedOn: string): Promise<string> {
  const settings = await readSettings(tx, orgId);
  const year = issuedOn.slice(0, 4);
  const { rows } = await tx.query<{ n: number }>('select struo_next_number($1, $2) as n', [orgId, settings.numberYearly ? `invoice-${year}` : 'invoice']);
  const counter = String(rows[0]!.n).padStart(settings.numberPadding, '0');
  return settings.numberYearly ? `${settings.numberPrefix}-${year}-${counter}` : `${settings.numberPrefix}-${counter}`;
}

// ---------------------------------------------------------------- drafts

const draftInput = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(INVOICE_KINDS),
  label: text(200),
  dueOn: dateString.optional(),
  /** Prefill a progress statement: one progress line per phase, from validated progress. */
  fromProgress: z.boolean().default(false),
});

/** Starts a draft on a site. Rates come from the site (no retention on an advance). */
export async function createDraftInvoice(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'finance.write');
  const data = parse(draftInput, input);
  return asActor(db, actor, async (tx) => {
    const project = (await tx.query<{ currency: string; vat: number; retention: number; budget: string }>(
      'select currency_code as currency, vat_bps as vat, retention_bps as retention, budget_minor as budget from project where id = $1 and org_id = $2',
      [data.projectId, actor.orgId])).rows[0];
    if (!project) throw notFound();
    const settings = await readSettings(tx, actor.orgId);
    const today = new Date().toISOString().slice(0, 10);
    const due = data.dueOn ?? new Date(Date.now() + settings.dueDays * 86_400_000).toISOString().slice(0, 10);
    const { rows } = await tx.query<{ id: string }>(
      `insert into invoice (org_id, project_id, number, kind, label, issued_on, due_on, currency_code, amount_minor, vat_bps, retention_bps,
                            deduction_minor, status, terms, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, 0, 'draft', $11, $12) returning id`,
      [actor.orgId, data.projectId, `DRAFT-${randomBytes(5).toString('hex')}`, data.kind, data.label ?? null, today, due < today ? today : due,
        project.currency, project.vat, data.kind === 'advance' ? 0 : project.retention, settings.paymentTerms, actor.userId],
    );
    const id = rows[0]!.id;
    if (data.fromProgress && data.kind !== 'advance') await fillFromProgress(tx, actor.orgId, data.projectId, id);
    await recompute(tx, actor.orgId, id);
    await journal(tx, actor, 'invoice.draft', id, null, data);
    return { id };
  });
}

/**
 * One progress line per phase: its budget as the contract amount, its validated progress as the
 * cumulative %, and what issued statements already invoiced for it. Statements issued before lines
 * existed are taken off as one line, so nothing is invoiced twice. The advance is deducted in
 * proportion of what this statement invoices.
 */
async function fillFromProgress(tx: Tx, orgId: string, projectId: string, invoiceId: string) {
  const phases = (await tx.query<{ id: string; name: string; budget: string; progress: number }>(
    'select id, name, budget_minor as budget, progress_pct as progress from project_phase where project_id = $1 and org_id = $2 order by position',
    [projectId, orgId])).rows;
  const previous = new Map((await tx.query<{ phase_id: string; total: string }>(
    `select l.phase_id, sum(l.amount_minor) as total from invoice_line l join invoice i on i.id = l.invoice_id
      where i.project_id = $1 and i.org_id = $2 and i.status = 'issued' and l.phase_id is not null group by l.phase_id`,
    [projectId, orgId])).rows.map((row) => [row.phase_id, Number(row.total)]));
  let position = 0;
  for (const phase of phases) {
    if (Number(phase.budget) <= 0) continue;
    await tx.query(
      `insert into invoice_line (org_id, invoice_id, position, kind, section, designation, phase_id, contract_minor, cumulative_bps, previous_minor)
       values ($1, $2, $3, 'progress', null, $4, $5, $6, $7, $8)`,
      [orgId, invoiceId, position++, phase.name, phase.id, Number(phase.budget), phase.progress * 100, previous.get(phase.id) ?? 0],
    );
  }
  // Statements issued without lines (before spec 035), so the cumulative stays right.
  const legacy = Number((await tx.query<{ total: string }>(
    `select coalesce(sum(i.amount_minor), 0) as total from invoice i
      where i.project_id = $1 and i.org_id = $2 and i.status = 'issued' and i.kind in ('progress', 'final')
        and not exists (select 1 from invoice_line l where l.invoice_id = i.id)`,
    [projectId, orgId])).rows[0]!.total);
  if (legacy > 0) {
    await tx.query(
      `insert into invoice_line (org_id, invoice_id, position, kind, designation, contract_minor, cumulative_bps, previous_minor)
       values ($1, $2, $3, 'progress', 'Situations antérieures', 0, 0, $4)`,
      [orgId, invoiceId, position++, legacy],
    );
  }
  // Advance deduction in proportion: advances invoiced × this statement / budget, within what remains.
  const advance = (await tx.query<{ advanced: string; deducted: string; budget: string }>(
    `select coalesce(sum(i.amount_minor + i.vat_minor) filter (where i.kind = 'advance'), 0) as advanced,
            coalesce(sum(i.deduction_minor) filter (where i.kind <> 'advance'), 0) as deducted,
            (select budget_minor from project where id = $1) as budget
       from invoice i where i.project_id = $1 and i.org_id = $2 and i.status = 'issued'`, [projectId, orgId])).rows[0]!;
  const amount = Number((await tx.query<{ total: string }>('select coalesce(sum(amount_minor), 0) as total from invoice_line where invoice_id = $1', [invoiceId])).rows[0]!.total);
  const budget = Number(advance.budget);
  if (budget > 0 && amount > 0) {
    const remaining = Math.max(0, Number(advance.advanced) - Number(advance.deducted));
    const deduction = Math.min(remaining, Math.round((Number(advance.advanced) * amount) / budget));
    await tx.query('update invoice set amount_minor = $3, deduction_minor = $2 where id = $1', [invoiceId, deduction, amount]);
  }
}

const lineInput = z.object({
  kind: z.enum(['item', 'progress', 'text']),
  section: text(120),
  designation: z.string().trim().min(1).max(500),
  unit: text(20),
  quantityMilli: z.number().int().min(0).max(1e15).default(0),
  unitPriceMinor: z.number().int().min(0).max(1e15).default(0),
  phaseId: z.string().uuid().nullable().optional(),
  contractMinor: z.number().int().min(0).max(1e15).default(0),
  cumulativeBps: z.number().int().min(0).max(10_000).default(0),
  previousMinor: z.number().int().min(-1e15).max(1e15).default(0),
});

const adjustmentInput = z.object({
  label: z.string().trim().min(1).max(200),
  rateBps: z.number().int().min(0).max(10_000).nullable().optional(),
  base: z.enum(['ht', 'ttc']).default('ht'),
  amountMinor: z.number().int().min(0).max(1e15).default(0),
});

const saveInput = z.object({
  kind: z.enum(INVOICE_KINDS).optional(),
  label: text(200),
  issuedOn: dateString.optional(),
  dueOn: dateString.optional(),
  contractRef: text(120),
  orderRef: text(120),
  notes: text(2000),
  terms: text(1000),
  vatBps: z.number().int().min(0).max(10_000).optional(),
  vatExemptReason: text(200),
  retentionBps: z.number().int().min(0).max(10_000).optional(),
  deductionMinor: z.number().int().min(0).max(1e15).optional(),
  extraFields: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(200) })).max(12).optional(),
  lines: z.array(lineInput).max(300).optional(),
  adjustments: z.array(adjustmentInput).max(20).optional(),
});

async function draftFor(tx: Tx, orgId: string, id: string) {
  const row = (await tx.query<{ status: string }>('select status from invoice where id = $1 and org_id = $2 for update', [id, orgId])).rows[0];
  if (!row) throw notFound();
  if (row.status !== 'draft') throw new DomainError('invoice_not_draft', 409);
}

/** Saves a draft: header, lines (replaced), complementary deductions (replaced); totals recomputed. */
export async function saveDraftInvoice(db: Db, actor: Actor, id: string, input: unknown): Promise<InvoiceEdit> {
  ensure(actor, 'finance.write');
  const data = parse(saveInput, input);
  await asActor(db, actor, async (tx) => {
    await draftFor(tx, actor.orgId, id);
    const columns: Record<string, string> = {
      kind: 'kind', label: 'label', issuedOn: 'issued_on', dueOn: 'due_on', contractRef: 'contract_ref', orderRef: 'order_ref', notes: 'notes',
      terms: 'terms', vatBps: 'vat_bps', vatExemptReason: 'vat_exempt_reason', retentionBps: 'retention_bps', deductionMinor: 'deduction_minor',
      extraFields: 'extra_fields',
    };
    const entries = Object.entries(data).filter(([key, value]) => columns[key] && value !== undefined);
    if (entries.length) {
      await tx.query(`update invoice set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}${key === 'extraFields' ? '::jsonb' : ''}`).join(', ')} where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([key, value]) => (key === 'extraFields' ? JSON.stringify(value) : value))]);
    }
    if (data.lines) {
      await tx.query('delete from invoice_line where invoice_id = $1 and org_id = $2', [id, actor.orgId]);
      for (const [position, line] of data.lines.entries()) {
        await tx.query(
          `insert into invoice_line (org_id, invoice_id, position, kind, section, designation, unit, quantity_milli, unit_price_minor, phase_id,
                                     contract_minor, cumulative_bps, previous_minor)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [actor.orgId, id, position, line.kind, line.section ?? null, line.designation, line.unit ?? null, line.kind === 'item' ? line.quantityMilli : 0,
            line.kind === 'item' ? line.unitPriceMinor : 0, line.kind === 'progress' ? line.phaseId ?? null : null,
            line.kind === 'progress' ? line.contractMinor : 0, line.kind === 'progress' ? line.cumulativeBps : 0, line.kind === 'progress' ? line.previousMinor : 0],
        );
      }
    }
    if (data.adjustments) {
      await tx.query('delete from invoice_adjustment where invoice_id = $1 and org_id = $2', [id, actor.orgId]);
      for (const [position, adjustment] of data.adjustments.entries()) {
        await tx.query(
          `insert into invoice_adjustment (org_id, invoice_id, position, label, rate_bps, base, amount_minor) values ($1, $2, $3, $4, $5, $6, $7)`,
          [actor.orgId, id, position, adjustment.label, adjustment.rateBps ?? null, adjustment.base, adjustment.amountMinor],
        );
      }
    }
    try {
      await recompute(tx, actor.orgId, id);
    } catch (error) {
      if ((error as { code?: string }).code === '23514') throw new DomainError('deduction_too_high', 422);
      throw error;
    }
    await journal(tx, actor, 'invoice.save', id, null, { lines: data.lines?.length, adjustments: data.adjustments?.length });
  });
  return getInvoiceForEdit(db, actor, id);
}

/** The amount before VAT is the sum of the lines (when there are lines); deductions by rate follow it. */
async function recompute(tx: Tx, orgId: string, id: string) {
  const { rows } = await tx.query<{ lines: string; total: string | null }>(
    'select count(*) as lines, sum(amount_minor) as total from invoice_line where invoice_id = $1 and org_id = $2', [id, orgId]);
  if (Number(rows[0]!.lines) > 0) {
    await tx.query('update invoice set amount_minor = greatest(0, $3::bigint) where id = $1 and org_id = $2', [id, orgId, Number(rows[0]!.total ?? 0)]);
  }
  // Rates on the base (before or after VAT) become amounts; fixed amounts stay.
  await tx.query(
    `update invoice_adjustment a set amount_minor = case when a.base = 'ttc' then (i.total_minor * a.rate_bps + 5000) / 10000 else (i.amount_minor * a.rate_bps + 5000) / 10000 end
       from invoice i where i.id = a.invoice_id and a.invoice_id = $1 and a.org_id = $2 and a.rate_bps is not null`, [id, orgId]);
  await tx.query(
    `update invoice set other_deductions_minor = (select coalesce(sum(amount_minor), 0) from invoice_adjustment where invoice_id = $1) where id = $1 and org_id = $2`,
    [id, orgId]);
}

/** Issues a draft: it gets the next number of the series and is frozen. */
export async function issueInvoice(db: Db, actor: Actor, id: string): Promise<{ number: string }> {
  ensure(actor, 'finance.write');
  return asActor(db, actor, async (tx) => {
    await draftFor(tx, actor.orgId, id);
    const invoice = (await tx.query<{ amount: string; issued: string; due: string }>(
      `select amount_minor as amount, to_char(issued_on, 'YYYY-MM-DD') as issued, to_char(due_on, 'YYYY-MM-DD') as due from invoice where id = $1`, [id])).rows[0]!;
    if (Number(invoice.amount) <= 0) throw new DomainError('invoice_empty', 422);
    if (invoice.due < invoice.issued) throw new DomainError('due_before_issue', 422);
    const number = await nextInvoiceNumber(tx, actor.orgId, invoice.issued);
    await tx.query(`update invoice set status = 'issued', number = $3, issued_at = now() where id = $1 and org_id = $2`, [id, actor.orgId, number]);
    await journal(tx, actor, 'invoice.issue', id, { status: 'draft' }, { status: 'issued', number });
    return { number };
  });
}

export async function deleteDraftInvoice(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'finance.write');
  await asActor(db, actor, async (tx) => {
    await draftFor(tx, actor.orgId, id);
    await tx.query('delete from invoice where id = $1 and org_id = $2', [id, actor.orgId]);
    await journal(tx, actor, 'invoice.draft_delete', id, null, null);
  });
}

// ---------------------------------------------------------------- reading

export interface InvoiceLineRow {
  id: string; position: number; kind: 'item' | 'progress' | 'text'; section: string | null; designation: string; unit: string | null;
  quantityMilli: number; unitPriceMinor: number; phaseId: string | null; contractMinor: number; cumulativeBps: number; previousMinor: number; amountMinor: number;
}
export interface InvoiceAdjustmentRow { id: string; position: number; label: string; rateBps: number | null; base: 'ht' | 'ttc'; amountMinor: number }

export interface InvoiceEdit {
  id: string; status: string; number: string; kind: string; label: string | null; issuedOn: string; dueOn: string; currencyCode: string;
  projectId: string; projectCode: string; projectName: string; clientName: string | null;
  contractRef: string | null; orderRef: string | null; notes: string | null; terms: string | null; vatExemptReason: string | null;
  extraFields: CustomField[];
  amountMinor: number; vatBps: number; vatMinor: number; totalMinor: number; retentionBps: number; retentionMinor: number;
  deductionMinor: number; otherDeductionsMinor: number; netMinor: number;
  lines: InvoiceLineRow[]; adjustments: InvoiceAdjustmentRow[];
  phases: { id: string; name: string; budgetMinor: number; progressPct: number }[];
}

const num = (value: unknown) => Number(value ?? 0);

export async function getInvoiceForEdit(db: Db, actor: Actor, id: string): Promise<InvoiceEdit> {
  ensure(actor, 'finance.read');
  return asActor(db, actor, async (tx) => {
    const head = (await tx.query(
      `select i.id, i.status, i.number, i.kind, i.label, to_char(i.issued_on, 'YYYY-MM-DD') as "issuedOn", to_char(i.due_on, 'YYYY-MM-DD') as "dueOn",
              i.currency_code as "currencyCode", i.project_id as "projectId", p.code as "projectCode", p.name as "projectName", c.name as "clientName",
              i.contract_ref as "contractRef", i.order_ref as "orderRef", i.notes, i.terms, i.vat_exempt_reason as "vatExemptReason", i.extra_fields as "extraFields",
              i.amount_minor as "amountMinor", i.vat_bps as "vatBps", i.vat_minor as "vatMinor", i.total_minor as "totalMinor",
              i.retention_bps as "retentionBps", i.retention_minor as "retentionMinor", i.deduction_minor as "deductionMinor",
              i.other_deductions_minor as "otherDeductionsMinor", i.net_minor as "netMinor"
         from invoice i join project p on p.id = i.project_id left join client c on c.id = p.client_id
        where i.id = $1 and i.org_id = $2`, [id, actor.orgId])).rows[0] as Record<string, unknown> | undefined;
    if (!head) throw notFound();
    const lines = (await tx.query(
      `select id, position, kind, section, designation, unit, quantity_milli as "quantityMilli", unit_price_minor as "unitPriceMinor", phase_id as "phaseId",
              contract_minor as "contractMinor", cumulative_bps as "cumulativeBps", previous_minor as "previousMinor", amount_minor as "amountMinor"
         from invoice_line where invoice_id = $1 order by position`, [id])).rows.map((row) => ({
      ...row, quantityMilli: num(row.quantityMilli), unitPriceMinor: num(row.unitPriceMinor), contractMinor: num(row.contractMinor),
      previousMinor: num(row.previousMinor), amountMinor: num(row.amountMinor) })) as InvoiceLineRow[];
    const adjustments = (await tx.query(
      `select id, position, label, rate_bps as "rateBps", base, amount_minor as "amountMinor" from invoice_adjustment where invoice_id = $1 order by position`, [id]))
      .rows.map((row) => ({ ...row, amountMinor: num(row.amountMinor) })) as InvoiceAdjustmentRow[];
    const phases = (await tx.query(
      `select id, name, budget_minor as "budgetMinor", progress_pct as "progressPct" from project_phase where project_id = $1 order by position`, [head.projectId]))
      .rows.map((row) => ({ ...row, budgetMinor: num(row.budgetMinor) })) as InvoiceEdit['phases'];
    const money = ['amountMinor', 'vatMinor', 'totalMinor', 'retentionMinor', 'deductionMinor', 'otherDeductionsMinor', 'netMinor'];
    return { ...head, ...Object.fromEntries(money.map((key) => [key, num(head[key])])), lines, adjustments, phases } as InvoiceEdit;
  });
}
