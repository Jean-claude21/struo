import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { PAYMENT_METHODS, recordPayment } from './finance.ts';
import { hashToken } from './portal.ts';

/**
 * Spec 051: the client's application. What is new since the client's last visit, what waits for
 * them, where the money stands, how to pay (the company's own instructions — Struo never takes the
 * money), the payments the client declares (the company confirms them), the client's e-mail
 * preference, and phone notifications (Web Push) for the client and the team.
 *
 * The client has no account: everything on their side runs on the platform connection, keyed by the
 * hash of their link's token, scoped to that link's company and site.
 */

interface Link { id: string; orgId: string; projectId: string; showFinance: boolean; emailOptOut: boolean; showFieldReports: boolean }

async function linkOf(owner: Db, token: string): Promise<Link> {
  const { rows } = await owner.query<Link>(
    `select id, org_id as "orgId", project_id as "projectId", show_finance as "showFinance", email_opt_out as "emailOptOut", show_field_reports as "showFieldReports"
       from portal_link where token_hash = $1 and revoked_at is null`, [hashToken(token)]);
  if (!rows[0]) throw new DomainError('portal_link_invalid', 404);
  return rows[0];
}

/**
 * Records a visit and returns when the client came before (null on the first visit). Visits closer
 * than 30 minutes count as one, so « new since your visit » survives a reload.
 */
export async function portalVisit(owner: Db, token: string): Promise<{ since: string | null; emailOptOut: boolean; showFieldReports: boolean }> {
  const { rows } = await owner.query<{ since: string | null; emailOptOut: boolean; showFieldReports: boolean }>(
    `update portal_link set
        seen_before_at = case when last_visit_at is null or last_visit_at < now() - interval '30 minutes' then last_visit_at else seen_before_at end,
        last_visit_at = now()
      where token_hash = $1 and revoked_at is null
      returning to_char(seen_before_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as since, email_opt_out as "emailOptOut", show_field_reports as "showFieldReports"`, [hashToken(token)]);
  if (!rows[0]) throw new DomainError('portal_link_invalid', 404);
  return rows[0];
}

export interface PortalNews { reports: number; photos: number; messages: number; changes: number; invoices: number; documents: number }

/** What appeared on the client's site since a moment (what the link lets them see). */
export async function portalNews(owner: Db, token: string, since: string | null): Promise<PortalNews | null> {
  if (!since) return null;
  const link = await linkOf(owner, token);
  const { rows } = await owner.query<PortalNews>(
    `select
       (select count(*)::int from client_report r where r.project_id = l.project_id and r.status = 'sent' and r.sent_at > $2) as reports,
       (select count(*)::int from report_photo ph join site_report r on r.id = ph.report_id
          where r.project_id = l.project_id and r.status = 'validated' and ph.shared_with_client and l.show_photos and coalesce(r.reviewed_at, r.taken_at) > $2) as photos,
       (select count(*)::int from message m where m.project_id = l.project_id and m.author_kind = 'team' and l.show_messages and m.created_at > $2) as messages,
       (select count(*)::int from change_order c where c.project_id = l.project_id and c.status = 'sent' and l.show_finance and c.sent_at > $2) as changes,
       (select count(*)::int from invoice i where i.project_id = l.project_id and i.status = 'issued' and l.show_finance and i.created_at > $2) as invoices,
       (select count(*)::int from project_document d where d.project_id = l.project_id and d.shared_with_client and l.show_documents and d.updated_at > $2) as documents
       from portal_link l where l.id = $1`, [link.id, since]);
  return rows[0] ?? null;
}

export interface PortalMoney {
  contractMinor: number; acceptedChangesMinor: number; totalMinor: number;
  invoicedMinor: number; paidMinor: number; dueMinor: number; toInvoiceMinor: number; currency: string;
}

/** Where the money stands for the client: the contract, accepted change orders, invoiced, paid, left. */
export async function portalMoney(owner: Db, token: string): Promise<PortalMoney | null> {
  const link = await linkOf(owner, token);
  if (!link.showFinance) return null;
  const { rows } = await owner.query<PortalMoney>(
    `select p.budget_minor::float8 as "contractMinor",
            coalesce((select sum(amount_minor) from change_order c where c.project_id = p.id and c.status = 'accepted'), 0)::float8 as "acceptedChangesMinor",
            coalesce((select sum(net_minor) from invoice_balance b where b.project_id = p.id), 0)::float8 as "invoicedMinor",
            coalesce((select sum(paid_minor) from invoice_balance b where b.project_id = p.id), 0)::float8 as "paidMinor",
            coalesce((select sum(balance_minor) from invoice_balance b where b.project_id = p.id), 0)::float8 as "dueMinor",
            p.currency_code as currency
       from project p where p.id = $1 and p.org_id = $2`, [link.projectId, link.orgId]);
  const row = rows[0];
  if (!row) return null;
  const totalMinor = row.contractMinor + row.acceptedChangesMinor;
  return { ...row, totalMinor, toInvoiceMinor: Math.max(0, totalMinor - row.invoicedMinor) };
}

export interface PaymentInstructions { bankDetails: string | null; mobileMoney: string | null; paymentTerms: string | null; canDeclare: boolean }

/** How the company asks to be paid (its own words, from its invoice settings). */
export async function portalPaymentInstructions(owner: Db, token: string): Promise<PaymentInstructions> {
  const link = await linkOf(owner, token);
  const { rows } = await owner.query<PaymentInstructions>(
    `select bank_details as "bankDetails", mobile_money as "mobileMoney", payment_terms as "paymentTerms", client_can_declare as "canDeclare"
       from invoice_settings where org_id = $1`, [link.orgId]);
  return rows[0] ?? { bankDetails: null, mobileMoney: null, paymentTerms: null, canDeclare: true };
}

export interface PaymentClaimRow {
  id: string; invoiceId: string; invoiceNumber: string; projectId: string; projectCode: string; projectName: string; clientName: string | null;
  amountMinor: number; currency: string; paidOn: string; method: string; reference: string | null; note: string | null; hasProof: boolean;
  status: 'pending' | 'confirmed' | 'rejected'; rejectReason: string | null; createdAt: string; decidedAt: string | null;
}

const claimSelect = `select c.id, c.invoice_id as "invoiceId", i.number as "invoiceNumber", c.project_id as "projectId", p.code as "projectCode", p.name as "projectName",
        cl.name as "clientName", c.amount_minor::float8 as "amountMinor", c.currency_code as currency, to_char(c.paid_on, 'YYYY-MM-DD') as "paidOn", c.method,
        c.reference, c.note, c.proof_key is not null as "hasProof", c.status, c.reject_reason as "rejectReason", c.created_at as "createdAt", c.decided_at as "decidedAt"
   from payment_claim c join invoice i on i.id = c.invoice_id join project p on p.id = c.project_id left join client cl on cl.id = p.client_id`;

/** The client's own declarations, newest first. */
export async function portalPaymentClaims(owner: Db, token: string): Promise<PaymentClaimRow[]> {
  const link = await linkOf(owner, token);
  const { rows } = await owner.query<PaymentClaimRow>(`${claimSelect} where c.project_id = $1 and c.org_id = $2 order by c.created_at desc limit 30`, [link.projectId, link.orgId]);
  return rows;
}

const claimInput = z.object({
  invoiceId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** « I paid »: the client declares a payment on one of their invoices, with an optional proof. */
export async function portalDeclarePayment(owner: Db, token: string, input: unknown, proof: { key: string; mediaType: string } | null = null): Promise<{ id: string; orgId: string; projectId: string }> {
  const link = await linkOf(owner, token);
  if (!link.showFinance) throw new DomainError('forbidden', 403);
  const data = parse(claimInput, input);
  const { rows: settings } = await owner.query<{ allowed: boolean }>('select coalesce((select client_can_declare from invoice_settings where org_id = $1), true) as allowed', [link.orgId]);
  if (!settings[0]?.allowed) throw new DomainError('forbidden', 403);
  const { rows: invoices } = await owner.query<{ currency: string; balance: number }>(
    'select currency_code as currency, balance_minor::float8 as balance from invoice_balance where invoice_id = $1 and project_id = $2', [data.invoiceId, link.projectId]);
  const invoice = invoices[0];
  if (!invoice) throw notFound();
  if (invoice.balance <= 0) throw new DomainError('nothing_to_pay', 409);
  const pending = await owner.query('select 1 from payment_claim where invoice_id = $1 and status = $2', [data.invoiceId, 'pending']);
  if (pending.rowCount) throw new DomainError('claim_pending', 409);
  const { rows } = await owner.query<{ id: string }>(
    `insert into payment_claim (org_id, project_id, invoice_id, portal_link_id, amount_minor, currency_code, paid_on, method, reference, note, proof_key, proof_media_type)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [link.orgId, link.projectId, data.invoiceId, link.id, data.amountMinor, invoice.currency, data.paidOn, data.method, data.reference || null, data.note || null, proof?.key ?? null, proof?.mediaType ?? null]);
  await owner.query(`insert into journal (org_id, command, target, after, actor, door) values ($1, 'payment.declare', $2, $3, $4, 'portal')`,
    [link.orgId, rows[0]!.id, JSON.stringify({ invoiceId: data.invoiceId, amountMinor: data.amountMinor, method: data.method }), `portal:${link.id}`]);
  return { id: rows[0]!.id, orgId: link.orgId, projectId: link.projectId };
}

/** The proof of a claim, for the office (member connection) or the client who sent it. */
export async function paymentClaimProof(db: Db, actor: Actor, id: string): Promise<{ key: string; mediaType: string } | null> {
  ensure(actor, 'finance.read');
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ key: string | null; mediaType: string | null }>('select proof_key as key, proof_media_type as "mediaType" from payment_claim where id = $1 and org_id = $2', [id, actor.orgId]);
    return rows[0]?.key ? { key: rows[0].key, mediaType: rows[0].mediaType ?? 'application/octet-stream' } : null;
  });
}

/** The payments the clients declared, for the accountant to confirm (pending first). */
export async function listPaymentClaims(db: Db, actor: Actor, filters: { status?: 'pending' | 'confirmed' | 'rejected'; projectId?: string } = {}): Promise<PaymentClaimRow[]> {
  ensure(actor, 'finance.read');
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<PaymentClaimRow>(
      `${claimSelect} where c.org_id = $1 and ($2::text is null or c.status = $2) and ($3::uuid is null or c.project_id = $3)
        order by (c.status = 'pending') desc, c.created_at desc limit 100`, [actor.orgId, filters.status ?? null, filters.projectId ?? null]);
    return rows;
  });
}

/** Confirms a declared payment: it becomes a payment on its invoice (the amount may be corrected). */
export async function confirmPaymentClaim(db: Db, actor: Actor, id: string, input: unknown = {}): Promise<{ paymentId: string }> {
  ensure(actor, 'finance.write');
  const data = parse(z.object({ amountMinor: z.number().int().positive().optional(), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional() }), input);
  const claim = await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ projectId: string; invoiceId: string; amountMinor: number; paidOn: string; method: string; reference: string | null; status: string }>(
      `select project_id as "projectId", invoice_id as "invoiceId", amount_minor::float8 as "amountMinor", to_char(paid_on, 'YYYY-MM-DD') as "paidOn", method, reference, status
         from payment_claim where id = $1 and org_id = $2 for update`, [id, actor.orgId]);
    return rows[0];
  });
  if (!claim) throw notFound();
  if (claim.status !== 'pending') throw new DomainError('claim_decided', 409);
  const payment = await recordPayment(db, actor, {
    projectId: claim.projectId, invoiceId: claim.invoiceId, amountMinor: data.amountMinor ?? claim.amountMinor, method: claim.method,
    receivedOn: data.receivedOn ?? claim.paidOn, reference: claim.reference, note: 'client',
  });
  await asActor(db, actor, async (tx) => {
    await tx.query(`update payment_claim set status = 'confirmed', payment_id = $3, decided_by = $4, decided_at = now() where id = $1 and org_id = $2`, [id, actor.orgId, payment.id, actor.userId]);
    await journal(tx, actor, 'payment.claim.confirm', id, null, { paymentId: payment.id });
  });
  return { paymentId: payment.id };
}

/** Refuses a declaration (not received, wrong amount…), with the reason the client will read. */
export async function rejectPaymentClaim(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'finance.write');
  const data = parse(z.object({ reason: z.string().trim().min(2).max(500) }), input);
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(
      `update payment_claim set status = 'rejected', reject_reason = $3, decided_by = $4, decided_at = now() where id = $1 and org_id = $2 and status = 'pending'`,
      [id, actor.orgId, data.reason, actor.userId]);
    if (!rowCount) throw new DomainError('claim_decided', 409);
    await journal(tx, actor, 'payment.claim.reject', id, null, { reason: data.reason });
  });
}

/** The client chooses whether they receive news by e-mail (access codes always go). */
export async function setPortalEmailOptOut(owner: Db, token: string, optOut: boolean): Promise<void> {
  const link = await linkOf(owner, token);
  await owner.query('update portal_link set email_opt_out = $2 where id = $1', [link.id, optOut]);
}

/** Who on the client side may receive an e-mail about a site (active links with an address, not opted out). */
export async function clientRecipients(owner: Db, projectId: string): Promise<{ linkId: string; email: string; contactName: string | null; tokenEnc: string | null; locale: 'fr' | 'en'; company: string; project: string }[]> {
  const { rows } = await owner.query<{ linkId: string; email: string; contactName: string | null; tokenEnc: string | null; locale: 'fr' | 'en'; company: string; project: string }>(
    `select l.id as "linkId", l.contact_email as email, l.contact_name as "contactName", l.token_enc as "tokenEnc", s.locale, o.name as company, p.name as project
       from portal_link l join project p on p.id = l.project_id join organization o on o.id = p.org_id join org_settings s on s.org_id = p.org_id
      where l.project_id = $1 and l.revoked_at is null and l.contact_email is not null and not l.email_opt_out and not s.is_demo
      order by l.created_at desc limit 3`, [projectId]);
  return rows;
}

/** Whether the client of a link opted out of e-mails. */
export async function clientOptedOut(owner: Db, projectId: string): Promise<boolean> {
  const { rows } = await owner.query<{ out: boolean }>(
    'select email_opt_out as out from portal_link where project_id = $1 and revoked_at is null order by created_at desc limit 1', [projectId]);
  return Boolean(rows[0]?.out);
}

// ---------------------------------------------------------------- phone notifications (Web Push)

const subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});
export interface PushTarget { id: string; endpoint: string; p256dh: string; auth: string }

/** A client's phone accepts notifications for their link. */
export async function savePortalPush(owner: Db, token: string, input: unknown): Promise<void> {
  const link = await linkOf(owner, token);
  const data = parse(subscription, input);
  await owner.query(
    `insert into push_subscription (org_id, portal_link_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set org_id = excluded.org_id, portal_link_id = excluded.portal_link_id, user_id = null, p256dh = excluded.p256dh, auth = excluded.auth`,
    [link.orgId, link.id, data.endpoint, data.keys.p256dh, data.keys.auth]);
}

/** A team member's phone (or browser) accepts notifications. */
export async function saveMemberPush(owner: Db, actor: Actor, input: unknown): Promise<void> {
  const data = parse(subscription, input);
  await owner.query(
    `insert into push_subscription (org_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set org_id = excluded.org_id, user_id = excluded.user_id, portal_link_id = null, p256dh = excluded.p256dh, auth = excluded.auth`,
    [actor.orgId, actor.userId, data.endpoint, data.keys.p256dh, data.keys.auth]);
}

export async function removePush(owner: Db, endpoint: string): Promise<void> {
  await owner.query('delete from push_subscription where endpoint = $1', [endpoint]);
}

/** The phones of a site's client (active links). */
export async function portalPushTargets(owner: Db, projectId: string): Promise<(PushTarget & { tokenEnc: string | null; locale: 'fr' | 'en' })[]> {
  const { rows } = await owner.query<PushTarget & { tokenEnc: string | null; locale: 'fr' | 'en' }>(
    `select s.id, s.endpoint, s.p256dh, s.auth, l.token_enc as "tokenEnc", o.locale from push_subscription s join portal_link l on l.id = s.portal_link_id
      join org_settings o on o.org_id = l.org_id
      where l.project_id = $1 and l.revoked_at is null and not o.is_demo`, [projectId]);
  return rows;
}

/** The phones of some team members of a company. */
export async function memberPushTargets(owner: Db, orgId: string, userIds: string[]): Promise<PushTarget[]> {
  if (!userIds.length) return [];
  const { rows } = await owner.query<PushTarget>(
    `select s.id, s.endpoint, s.p256dh, s.auth from push_subscription s join org_settings o on o.org_id = s.org_id
      where s.org_id = $1 and s.user_id = any($2::text[]) and not o.is_demo`, [orgId, userIds]);
  return rows;
}

export async function touchPush(owner: Db, id: string): Promise<void> {
  await owner.query('update push_subscription set last_used_at = now() where id = $1', [id]);
}

/** Whether a member's current device is subscribed (by endpoint). */
export async function memberHasPush(owner: Db, actor: Actor, endpoint: string): Promise<boolean> {
  const { rowCount } = await owner.query('select 1 from push_subscription where endpoint = $1 and user_id = $2', [endpoint, actor.userId]);
  return Boolean(rowCount);
}
