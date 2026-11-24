import { createHash } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';

/**
 * The platform operator's side (spec 038), on the platform's own connection (`owner`, it crosses
 * companies): licence products of the store mapped to plans, the companies with their detail,
 * suspension, trial extension, and the operator's own journal. A company redeems a licence key it
 * bought; the caller has verified the key with the store first.
 */

const hashKey = (key: string) => createHash('sha256').update(key.trim().toUpperCase()).digest('hex');

async function platformJournal(owner: Db, adminId: string, command: string, target: string | null, detail: unknown) {
  await owner.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)', [adminId, command, target, detail === undefined ? null : JSON.stringify(detail)]);
}

// ---------------------------------------------------------------- licence products

export interface LicenseProduct {
  productId: string; planCode: string; months: number; label: string; buyUrl: string | null; active: boolean;
  /** Spec 055: what the buyer reads (one line = one point, **bold**), highlighted offer, order. */
  description: string | null; descriptionEn: string | null; highlight: boolean; position: number;
}

export async function listLicenseProducts(owner: Db, onlyActive = false): Promise<LicenseProduct[]> {
  const { rows } = await owner.query<LicenseProduct>(
    `select product_id as "productId", plan_code as "planCode", months, label, buy_url as "buyUrl", active,
            description, description_en as "descriptionEn", highlight, position
       from platform_license_product ${onlyActive ? 'where active' : ''} order by position, plan_code, months`);
  return rows;
}

const productInput = z.object({
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{3,80}$/u),
  planCode: z.string().trim().min(1).max(40),
  months: z.number().int().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  buyUrl: z.string().trim().url().startsWith('https://').nullable().optional().or(z.literal('').transform(() => null)),
  active: z.boolean().default(true),
  description: z.string().trim().max(2000).nullable().optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  highlight: z.boolean().default(false),
  position: z.number().int().min(0).max(100).default(0),
});

export async function saveLicenseProduct(owner: Db, adminId: string, input: unknown): Promise<void> {
  const data = parse(productInput, input);
  const plan = await owner.query('select 1 from plan where code = $1', [data.planCode]);
  if (!plan.rowCount) throw new DomainError('not_found', 404);
  await owner.query(
    `insert into platform_license_product (product_id, plan_code, months, label, buy_url, active, description, description_en, highlight, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (product_id) do update set plan_code = excluded.plan_code, months = excluded.months, label = excluded.label, buy_url = excluded.buy_url,
       active = excluded.active, description = excluded.description, description_en = excluded.description_en, highlight = excluded.highlight, position = excluded.position`,
    [data.productId, data.planCode, data.months, data.label, data.buyUrl ?? null, data.active, data.description || null, data.descriptionEn || null, data.highlight, data.position],
  );
  await platformJournal(owner, adminId, 'license_product.save', data.productId, data);
}

export async function removeLicenseProduct(owner: Db, adminId: string, productId: string): Promise<void> {
  await owner.query('delete from platform_license_product where product_id = $1', [productId]);
  await platformJournal(owner, adminId, 'license_product.remove', productId, null);
}

// ---------------------------------------------------------------- redeeming a key

export interface VerifiedLicense {
  key: string;
  maskedKey: string;
  productId: string;
  customerEmail: string | null;
}

/** Which product a key's product is, before activating it at the store (refuses unknown products). */
export async function licenseProductFor(owner: Db, productId: string): Promise<LicenseProduct> {
  const product = (await listLicenseProducts(owner)).find((item) => item.productId === productId && item.active);
  if (!product) throw new DomainError('license_unknown_product', 422);
  return product;
}

export async function licenseAlreadyUsed(owner: Db, key: string): Promise<boolean> {
  const { rowCount } = await owner.query('select 1 from license_redemption where key_hash = $1', [hashKey(key)]);
  return Boolean(rowCount);
}

/**
 * Applies a licence the store accepted: the company moves to the product's plan and its paid period
 * is extended by the product's months (from today, or from the end of the current period).
 */
export async function redeemLicense(owner: Db, actor: Actor, license: VerifiedLicense): Promise<{ planCode: string; paidUntil: string }> {
  ensure(actor, 'org.manage');
  const product = await licenseProductFor(owner, license.productId);
  const client = await owner.connect();
  try {
    await client.query('begin');
    const current = (await client.query<{ paid_until: string | null }>('select paid_until from org_settings where org_id = $1 for update', [actor.orgId])).rows[0];
    if (!current) throw notFound();
    const { rows } = await client.query<{ until: string }>(
      `select (greatest(coalesce($1::timestamptz, now()), now()) + make_interval(months => $2))::text as until`, [current.paid_until, product.months]);
    const until = rows[0]!.until;
    try {
      await client.query(
        `insert into license_redemption (org_id, key_hash, masked_key, product_id, plan_code, months, customer_email, redeemed_by, paid_until)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [actor.orgId, hashKey(license.key), license.maskedKey, product.productId, product.planCode, product.months, license.customerEmail, actor.userId, until],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new DomainError('license_already_used', 409);
      throw error;
    }
    await client.query('update org_settings set plan_code = $2, paid_until = $3 where org_id = $1', [actor.orgId, product.planCode, until]);
    await client.query(`insert into journal (org_id, command, target, after, actor, door) values ($1, 'license.redeem', $1, $2, $3, $4)`,
      [actor.orgId, JSON.stringify({ product: product.productId, plan: product.planCode, months: product.months, key: license.maskedKey }), actor.userId, actor.door]);
    await client.query('commit');
    return { planCode: product.planCode, paidUntil: new Date(until).toISOString() };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function myRedemptions(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select masked_key as "maskedKey", plan_code as "planCode", months, redeemed_at as "redeemedAt", paid_until as "paidUntil"
         from license_redemption where org_id = $1 order by redeemed_at desc limit 20`, [actor.orgId]);
    return rows as { maskedKey: string; planCode: string; months: number; redeemedAt: string; paidUntil: string }[];
  });
}

// ---------------------------------------------------------------- companies

export async function platformCompany(owner: Db, orgId: string) {
  const head = (await owner.query(
    `select o.id as "orgId", o.name, o."createdAt" as "createdAt", s.plan_code as "planCode", s.trial_ends_at as "trialEndsAt", s.paid_until as "paidUntil",
            s.suspended_at as "suspendedAt", s.suspended_reason as "suspendedReason", s.country_code as "countryCode", s.currency_code as "currencyCode"
       from organization o join org_settings s on s.org_id = o.id where o.id = $1`, [orgId])).rows[0];
  if (!head) throw notFound();
  const [members, usage, redemptions, payments, journalRows] = await Promise.all([
    owner.query(`select u.name, u.email, m.role, m."createdAt" as "joinedAt" from member m join "user" u on u.id = m."userId" where m."organizationId" = $1 order by m."createdAt"`, [orgId]),
    owner.query(
      `select (select count(*)::int from project where org_id = $1 and archived_at is null) as projects,
              (select count(*)::int from site_report where org_id = $1 and created_at > now() - interval '30 days') as "reports30",
              (select count(*)::int from invoice where org_id = $1 and status = 'issued') as invoices,
              (select count(*)::int from ai_usage where org_id = $1 and at >= date_trunc('month', now())) as "aiTurns",
              (select coalesce(sum(cost_microusd), 0)::bigint from ai_usage where org_id = $1 and at >= date_trunc('month', now()) and payer = 'company') as "aiMicro",
              (select max(at) from journal where org_id = $1) as "lastActivity"`, [orgId]),
    owner.query(`select masked_key as "maskedKey", product_id as "productId", plan_code as "planCode", months, redeemed_at as "redeemedAt", paid_until as "paidUntil", customer_email as "customerEmail" from license_redemption where org_id = $1 order by redeemed_at desc`, [orgId]),
    owner.query(`select amount_minor as "amountMinor", currency_code as "currencyCode", status, paid_at as "paidAt", plan_code as "planCode" from subscription_payment where org_id = $1 order by created_at desc limit 20`, [orgId]).catch(() => ({ rows: [] })),
    owner.query(`select at, command, admin_id as "adminId", detail from platform_journal where target = $1 order by id desc limit 30`, [orgId]),
  ]);
  const u = usage.rows[0] as Record<string, unknown>;
  return {
    ...head, members: members.rows, redemptions: redemptions.rows, payments: payments.rows, journal: journalRows.rows,
    usage: { projects: Number(u.projects), reports30: Number(u.reports30), invoices: Number(u.invoices), aiTurns: Number(u.aiTurns),
      aiCents: Math.round(Number(u.aiMicro) / 10_000), lastActivity: u.lastActivity ?? null },
  };
}

export async function setCompanySuspended(owner: Db, adminId: string, orgId: string, suspended: boolean, reason?: string | null): Promise<void> {
  const { rowCount } = await owner.query(
    'update org_settings set suspended_at = case when $2 then now() else null end, suspended_reason = case when $2 then $3 else null end where org_id = $1',
    [orgId, suspended, reason ?? null]);
  if (!rowCount) throw notFound();
  await platformJournal(owner, adminId, suspended ? 'company.suspend' : 'company.reactivate', orgId, { reason });
}

export async function extendTrial(owner: Db, adminId: string, orgId: string, days: number): Promise<void> {
  const value = parse(z.number().int().min(1).max(180), days);
  const { rowCount } = await owner.query(`update org_settings set trial_ends_at = greatest(trial_ends_at, now()) + make_interval(days => $2) where org_id = $1`, [orgId, value]);
  if (!rowCount) throw notFound();
  await platformJournal(owner, adminId, 'trial.extend', orgId, { days: value });
}

export async function extendPaidPeriod(owner: Db, adminId: string, orgId: string, months: number): Promise<void> {
  const value = parse(z.number().int().min(1).max(60), months);
  const { rowCount } = await owner.query(`update org_settings set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(months => $2) where org_id = $1`, [orgId, value]);
  if (!rowCount) throw notFound();
  await platformJournal(owner, adminId, 'paid.extend', orgId, { months: value });
}

export async function platformJournalList(owner: Db, limit = 100) {
  const { rows } = await owner.query(
    `select j.at, j.command, j.target, j.detail, u.email as "adminEmail", o.name as "companyName"
       from platform_journal j left join "user" u on u.id = j.admin_id left join organization o on o.id = j.target order by j.id desc limit $1`, [limit]);
  return rows;
}

export async function listAllRedemptions(owner: Db, limit = 100) {
  const { rows } = await owner.query(
    `select r.masked_key as "maskedKey", r.product_id as "productId", r.plan_code as "planCode", r.months, r.redeemed_at as "redeemedAt", r.paid_until as "paidUntil",
            r.customer_email as "customerEmail", o.name as "companyName", r.org_id as "orgId"
       from license_redemption r join organization o on o.id = r.org_id order by r.redeemed_at desc limit $1`, [limit]);
  return rows;
}

/** Journals a gesture of the operator (a plan set from the console). */
export { platformJournal as recordPlatformGesture };

// ---------------------------------------------------------------- contact requests (spec 045)

export interface ContactRequest {
  id: string; createdAt: string; name: string; company: string | null; reach: string; activeSites: number | null;
  message: string | null; countryCode: string | null; locale: string; handledAt: string | null;
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(160).nullable().optional().transform((value) => value || null),
  reach: z.string().trim().min(3).max(160),
  activeSites: z.number().int().min(0).max(10000).nullable().optional(),
  message: z.string().trim().max(2000).nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/u).nullable().optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

/**
 * A prospect asks to be called back from the public site. The same contact sent twice within an
 * hour is kept once (a double click or an impatient visitor), and nothing is sent to anyone.
 */
export async function createContactRequest(owner: Db, input: unknown): Promise<boolean> {
  const data = parse(contactSchema, input);
  const { rows } = await owner.query(
    `select 1 from contact_request where lower(reach) = lower($1) and created_at > now() - interval '1 hour'`, [data.reach]);
  if (rows.length) return false;
  await owner.query(
    `insert into contact_request (name, company, reach, active_sites, message, country_code, locale) values ($1, $2, $3, $4, $5, $6, $7)`,
    [data.name, data.company, data.reach, data.activeSites ?? null, data.message || null, data.countryCode ?? null, data.locale]);
  return true;
}

export async function listContactRequests(owner: Db, limit = 200): Promise<ContactRequest[]> {
  const { rows } = await owner.query<ContactRequest>(
    `select id, created_at as "createdAt", name, company, reach, active_sites as "activeSites", message,
            country_code as "countryCode", locale, handled_at as "handledAt"
       from contact_request order by created_at desc limit $1`, [limit]);
  return rows;
}

export async function markContactHandled(owner: Db, id: string, adminId: string): Promise<void> {
  const { rowCount } = await owner.query('update contact_request set handled_at = now(), handled_by = $2 where id = $1 and handled_at is null', [id, adminId]);
  if (!rowCount) throw notFound();
  await platformJournal(owner, adminId, 'contact.handled', null, { id });
}

/** Spec 062: whether the public site shows the prices, or « on quote » for every plan. */
export async function publicPrices(q: Pick<Db, 'query'>): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select public_prices as on from platform_settings');
  return rows[0]?.on ?? false;
}

export async function setPublicPrices(owner: Db, adminId: string, on: boolean): Promise<boolean> {
  const value = parse(z.boolean(), on);
  await owner.query('update platform_settings set public_prices = $1, updated_at = now(), updated_by = $2', [value, adminId]);
  await platformJournal(owner, adminId, 'prices.public', 'platform', { on: value });
  return value;
}

// ---------------------------------------------------------------- store pulses (spec 069)

export type PulseOutcome = 'received' | 'applied' | 'already' | 'unmatched' | 'ignored' | 'failed';

/** Records a delivery once; false when the same delivery already arrived (a retry). */
export async function recordStorePulse(owner: Db, input: { deliveryId: string; event: string; buyerEmail?: string | null; productId?: string | null }): Promise<boolean> {
  const { rowCount } = await owner.query(
    `insert into store_pulse (delivery_id, event, buyer_email, product_id) values ($1, $2, $3, $4) on conflict (delivery_id) do nothing`,
    [input.deliveryId.slice(0, 200), input.event.slice(0, 80), input.buyerEmail?.toLowerCase() ?? null, input.productId ?? null]);
  return rowCount === 1;
}

export async function settleStorePulse(owner: Db, deliveryId: string, outcome: PulseOutcome, detail?: { companyName?: string | null; text?: string | null }): Promise<void> {
  await owner.query('update store_pulse set outcome = $2, company_name = $3, detail = $4 where delivery_id = $1',
    [deliveryId, outcome, detail?.companyName ?? null, detail?.text?.slice(0, 500) ?? null]);
}

export async function listStorePulses(owner: Db, limit = 30) {
  const { rows } = await owner.query<{ deliveryId: string; event: string; at: string; outcome: PulseOutcome; buyerEmail: string | null; productId: string | null; companyName: string | null; detail: string | null }>(
    `select delivery_id as "deliveryId", event, to_char(received_at, 'YYYY-MM-DD HH24:MI') as at, outcome, buyer_email as "buyerEmail",
            product_id as "productId", company_name as "companyName", detail
       from store_pulse order by received_at desc limit $1`, [limit]);
  return rows;
}

/**
 * The company a buyer pays for: the real (not demo) companies where this e-mail is owner or admin.
 * One company: it; several: the one most recently created; none: null (the founder is told).
 */
export async function companyForBuyer(owner: Db, email: string): Promise<{ orgId: string; userId: string; name: string } | null> {
  const { rows } = await owner.query<{ orgId: string; userId: string; name: string }>(
    `select o.id as "orgId", u.id as "userId", o.name
       from "user" u join member m on m."userId" = u.id join organization o on o.id = m."organizationId" join org_settings s on s.org_id = o.id
      where lower(u.email) = lower($1) and m.role in ('owner', 'admin') and not s.is_demo
      order by o."createdAt" desc limit 1`, [email]);
  return rows[0] ?? null;
}
