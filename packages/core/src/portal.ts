import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a portal link for a project. The token is returned once and only its hash is kept. */
export async function createPortalLink(db: Db, actor: Actor, projectId: string, label?: string): Promise<{ id: string; token: string }> {
  ensure(actor, 'portal.manage');
  const token = randomBytes(24).toString('base64url');
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    const { rows } = await tx.query<{ id: string }>(
      'insert into portal_link (org_id, project_id, token_hash, label, created_by) values ($1, $2, $3, $4, $5) returning id',
      [actor.orgId, projectId, hashToken(token), label ?? null, actor.userId],
    );
    await journal(tx, actor, 'portal.link_create', rows[0]!.id, null, { projectId, label });
    return { id: rows[0]!.id, token };
  });
}

export async function listPortalLinks(db: Db, actor: Actor, projectId: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, label, created_at as "createdAt", revoked_at as "revokedAt", last_seen_at as "lastSeenAt"
         from portal_link where org_id = $1 and project_id = $2 order by created_at desc`,
      [actor.orgId, projectId],
    );
    return rows as { id: string; label: string | null; createdAt: string; revokedAt: string | null; lastSeenAt: string | null }[];
  });
}

export async function revokePortalLink(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'portal.manage');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query('update portal_link set revoked_at = now() where id = $1 and org_id = $2 and revoked_at is null', [id, actor.orgId]);
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'portal.link_revoke', id, null, null);
  });
}

// ---------------------------------------------------------------- the portal itself (no account)

export interface PortalView {
  company: { name: string; logo: string | null; brandColor: string | null; locale: 'fr' | 'en' };
  project: {
    id: string; code: string; name: string; status: string; location: string | null; startDate: string | null;
    endDate: string | null; progress: number; currency: string; client: string | null; clientEmail: string | null;
  };
  phases: { name: string; progress: number }[];
  milestones: { id: string; name: string; plannedOn: string; actualOn: string | null; clientValidation: boolean; validatedAt: string | null }[];
  photos: { id: string; takenAt: string; note: string | null }[];
  documents: { id: string; title: string; hasFile: boolean }[];
  invoices: { id: string; number: string; kind: string; issuedOn: string; dueOn: string; net: number; paid: number; balance: number; currency: string }[];
  messages: { authorKind: 'team' | 'client'; authorName: string; body: string; at: string }[];
  canPay: boolean;
}

export async function portalView(db: Db, token: string): Promise<PortalView | null> {
  const { rows } = await db.query<{ view: PortalView | null }>('select struo_portal_view($1) as view', [hashToken(token)]);
  if (rows[0]?.view) await db.query('select struo_portal_link($1)', [hashToken(token)]);
  return rows[0]?.view ?? null;
}

export async function portalPostMessage(db: Db, token: string, body: unknown): Promise<void> {
  const text = parse(z.string().trim().min(1).max(4000), body);
  try {
    await db.query('select struo_portal_post_message($1, $2)', [hashToken(token), text]);
  } catch (error) {
    if (String((error as Error).message).includes('portal_link_invalid')) throw new DomainError('portal_link_invalid', 404);
    throw error;
  }
}

export async function portalValidateMilestone(db: Db, token: string, milestoneId: string, signer: unknown): Promise<boolean> {
  const name = parse(z.string().trim().min(2).max(120), signer);
  const { rows } = await db.query<{ done: boolean }>('select struo_portal_validate_milestone($1, $2, $3) as done', [
    hashToken(token), milestoneId, name,
  ]);
  return rows[0]?.done ?? false;
}

export async function portalFile(db: Db, token: string, fileId: string) {
  const { rows } = await db.query<{ storage_key: string; media_type: string }>('select * from struo_portal_file($1, $2)', [hashToken(token), fileId]);
  const row = rows[0];
  return row ? { storageKey: row.storage_key, mediaType: row.media_type } : null;
}

// ---------------------------------------------------------------- messages (team side)

export async function listMessages(db: Db, actor: Actor, projectId: string) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, author_kind as "authorKind", author_name as "authorName", body, created_at as "createdAt"
         from message where org_id = $1 and project_id = $2 order by created_at`,
      [actor.orgId, projectId],
    );
    return rows as { id: string; authorKind: string; authorName: string; body: string; createdAt: string }[];
  });
}

export async function postTeamMessage(db: Db, actor: Actor, projectId: string, body: unknown): Promise<void> {
  ensure(actor, 'messages.write');
  const text = parse(z.string().trim().min(1).max(4000), body);
  await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ name: string }>('select name from "user" where id = $1', [actor.userId]);
    const inserted = await tx.query<{ id: string }>(
      `insert into message (org_id, project_id, author_kind, author_id, author_name, body)
       select $1, $2, 'team', $3, $4, $5 where exists (select 1 from project where id = $2 and org_id = $1) returning id`,
      [actor.orgId, projectId, actor.userId, rows[0]?.name ?? '—', text],
    );
    if (!inserted.rowCount) throw notFound();
    await journal(tx, actor, 'message.post', inserted.rows[0]!.id, null, { body: text });
  });
}

// ---------------------------------------------------------------- online payment (owner connection)

/**
 * Starts an online payment of an invoice from the portal. Runs with the owner connection because
 * no member is acting; everything is scoped by the link's company and project.
 */
export async function portalPaymentContext(owner: Db, token: string, invoiceId: string) {
  const { rows } = await owner.query<{
    orgId: string; projectId: string; balance: number; currency: string; number: string; clientEmail: string | null;
    clientName: string | null; provider: string | null; secretEnc: string | null;
  }>(
    `select l.org_id as "orgId", l.project_id as "projectId", b.balance_minor as balance, b.currency_code as currency,
            b.number, c.email as "clientEmail", c.name as "clientName", op.provider, op.secret_enc as "secretEnc"
       from portal_link l
       join invoice_balance b on b.project_id = l.project_id and b.invoice_id = $2
       join project p on p.id = l.project_id left join client c on c.id = p.client_id
       left join org_payment_provider op on op.org_id = l.org_id and op.enabled
      where l.token_hash = $1 and l.revoked_at is null`,
    [hashToken(token), invoiceId],
  );
  const row = rows[0];
  if (!row) throw new DomainError('not_found', 404);
  if (row.balance <= 0) throw new DomainError('nothing_to_pay', 409);
  if (!row.provider) throw new DomainError('payment_unavailable', 409);
  return row;
}

export async function createPaymentIntent(
  owner: Db,
  input: { orgId: string; invoiceId: string; provider: string; amountMinor: number; currencyCode: string },
): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `insert into payment_intent (org_id, invoice_id, provider, amount_minor, currency_code) values ($1, $2, $3, $4, $5) returning id`,
    [input.orgId, input.invoiceId, input.provider, input.amountMinor, input.currencyCode],
  );
  return rows[0]!.id;
}

export async function attachPaymentIntent(owner: Db, intentId: string, providerRef: string, checkoutUrl: string): Promise<void> {
  await owner.query('update payment_intent set provider_ref = $2, checkout_url = $3 where id = $1', [intentId, providerRef, checkoutUrl]);
}

/**
 * Applies a verified provider outcome once: a succeeded intent becomes a payment on its invoice.
 * Idempotent: an intent already completed is left as it is.
 */
export async function settlePaymentIntent(
  owner: Db,
  outcome: { intentId: string; status: 'succeeded' | 'failed' | 'cancelled'; amountMinor: number; currencyCode: string },
): Promise<'applied' | 'ignored'> {
  const client = await owner.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{
      id: string; org_id: string; invoice_id: string; amount_minor: number; currency_code: string; status: string; provider: string;
      provider_ref: string | null;
    }>('select * from payment_intent where id = $1 for update', [outcome.intentId]);
    const intent = rows[0];
    if (!intent || intent.status !== 'pending') {
      await client.query('rollback');
      return 'ignored';
    }
    if (outcome.status !== 'succeeded') {
      await client.query(`update payment_intent set status = $2, completed_at = now() where id = $1`, [intent.id, outcome.status]);
    } else {
      if (outcome.currencyCode !== intent.currency_code || outcome.amountMinor !== intent.amount_minor) {
        throw new DomainError('payment_mismatch', 422);
      }
      const invoice = (await client.query<{ project_id: string }>('select project_id from invoice where id = $1', [intent.invoice_id])).rows[0]!;
      const payment = await client.query<{ id: string }>(
        `insert into payment (org_id, project_id, invoice_id, amount_minor, currency_code, method, reference, note)
         values ($1, $2, $3, $4, $5, 'mobile_money', $6, 'online') returning id`,
        [intent.org_id, invoice.project_id, intent.invoice_id, intent.amount_minor, intent.currency_code,
          `${intent.provider}:${intent.provider_ref ?? intent.id}`],
      );
      await client.query(`update payment_intent set status = 'succeeded', completed_at = now(), payment_id = $2 where id = $1`, [
        intent.id, payment.rows[0]!.id,
      ]);
      await client.query(
        `insert into journal (org_id, command, target, after, actor, door) values ($1, 'payment.online', $2, $3, $4, 'portal')`,
        [intent.org_id, payment.rows[0]!.id, JSON.stringify(outcome), `${intent.provider}`],
      );
    }
    await client.query('commit');
    return 'applied';
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function findIntentByProviderRef(owner: Db, provider: string, providerRef: string) {
  const { rows } = await owner.query<{ id: string; orgId: string }>(
    'select id, org_id as "orgId" from payment_intent where provider = $1 and provider_ref = $2',
    [provider, providerRef],
  );
  return rows[0] ?? null;
}

export async function paymentProviderSecrets(owner: Db, orgId: string) {
  const { rows } = await owner.query<{ provider: string; secretEnc: string | null; webhookSecretEnc: string | null }>(
    `select provider, secret_enc as "secretEnc", webhook_secret_enc as "webhookSecretEnc" from org_payment_provider
      where org_id = $1 and enabled`,
    [orgId],
  );
  return rows[0] ?? null;
}

/** Sets the company's own payment account (secrets already encrypted by the caller). */
export async function setPaymentProvider(
  db: Db,
  actor: Actor,
  input: { provider: string; secretEnc: string | null; webhookSecretEnc: string | null; enabled: boolean },
): Promise<void> {
  ensure(actor, 'org.manage');
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into org_payment_provider (org_id, provider, secret_enc, webhook_secret_enc, enabled)
       values ($1, $2, $3, $4, $5)
       on conflict (org_id) do update set provider = excluded.provider,
         secret_enc = coalesce(excluded.secret_enc, org_payment_provider.secret_enc),
         webhook_secret_enc = coalesce(excluded.webhook_secret_enc, org_payment_provider.webhook_secret_enc),
         enabled = excluded.enabled, updated_at = now()`,
      [actor.orgId, input.provider, input.secretEnc, input.webhookSecretEnc, input.enabled],
    );
    await journal(tx, actor, 'payments.provider', actor.orgId, null, { provider: input.provider, enabled: input.enabled });
  });
}

export async function getPaymentProvider(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ provider: string; enabled: boolean; hasSecret: boolean; hasWebhookSecret: boolean }>(
      `select provider, enabled, secret_enc is not null as "hasSecret", webhook_secret_enc is not null as "hasWebhookSecret"
         from org_payment_provider where org_id = $1`,
      [actor.orgId],
    );
    return rows[0] ?? null;
  });
}

// ---------------------------------------------------------------- client access by e-mail code (spec 022)

export interface PortalAccess {
  linkId: string;
  orgId: string;
  projectId: string;
  requireCode: boolean;
  verified: boolean;
  contactEmail: string | null;
  contactName: string | null;
  show: { photos: boolean; planning: boolean; finance: boolean; documents: boolean; messages: boolean };
}

/** Who may see what through a link, and whether this device has been confirmed. */
export async function portalAccess(db: Db, token: string, deviceToken: string | null): Promise<PortalAccess | null> {
  const { rows } = await db.query<Record<string, unknown>>('select * from struo_portal_access($1, $2)', [hashToken(token), deviceToken ? hashToken(deviceToken) : '']);
  const row = rows[0];
  if (!row) return null;
  return {
    linkId: String(row.link_id), orgId: String(row.org_id), projectId: String(row.project_id), requireCode: Boolean(row.require_code),
    verified: Boolean(row.verified), contactEmail: (row.contact_email as string | null) ?? null, contactName: (row.contact_name as string | null) ?? null,
    show: {
      photos: Boolean(row.show_photos), planning: Boolean(row.show_planning), finance: Boolean(row.show_finance),
      documents: Boolean(row.show_documents), messages: Boolean(row.show_messages),
    },
  };
}

export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/** Issues a 6-digit code for the link's contact e-mail. The caller sends it; only its hash is kept. */
export async function portalIssueCode(db: Db, token: string): Promise<{ email: string; code: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    const { rows } = await db.query<{ email: string }>('select struo_portal_issue_code($1, $2) as email', [hashToken(token), hashToken(code)]);
    return { email: rows[0]!.email, code };
  } catch (error) {
    const message = String((error as Error).message);
    for (const known of ['portal_link_invalid', 'portal_no_email', 'portal_too_many_codes']) {
      if (message.includes(known)) throw new DomainError(known, known === 'portal_link_invalid' ? 404 : 422);
    }
    throw error;
  }
}

/** Checks a code; on success returns a device token to keep in an httpOnly cookie. */
export async function portalVerifyCode(db: Db, token: string, code: unknown): Promise<string | null> {
  const clean = parse(z.string().trim().regex(/^\d{6}$/u), code);
  const device = randomBytes(24).toString('base64url');
  const { rows } = await db.query<{ ok: boolean }>('select struo_portal_verify_code($1, $2, $3) as ok', [hashToken(token), hashToken(clean), hashToken(device)]);
  return rows[0]?.ok ? device : null;
}

/** The client validates a milestone by signing with their finger (the image is stored first). */
export async function portalSignMilestone(
  db: Db, token: string, input: { milestoneId: string; signer: unknown; verdict: unknown; reserve: unknown }, signatureId: string, imageKey: string,
): Promise<boolean> {
  const signer = parse(z.string().trim().min(2).max(120), input.signer);
  const verdict = parse(z.enum(['conform', 'reserve']), input.verdict);
  const reserve = parse(z.string().trim().max(2000).nullable(), input.reserve ?? null);
  const { rows } = await db.query<{ done: boolean }>('select struo_portal_sign_milestone($1, $2, $3, $4, $5, $6, $7) as done', [
    hashToken(token), input.milestoneId, signer, signatureId, imageKey, verdict, reserve,
  ]);
  return rows[0]?.done ?? false;
}

export interface PortalReport { id: string; takenAt: string; note: string | null; phase: string | null; progress: number | null; author: string; photos: string[] }

export async function portalReports(db: Db, token: string): Promise<PortalReport[]> {
  const { rows } = await db.query<{ reports: PortalReport[] }>('select struo_portal_reports($1) as reports', [hashToken(token)]);
  return rows[0]?.reports ?? [];
}

const linkSettings = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal('').transform(() => null)),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  requireCode: z.boolean().optional(),
  showPhotos: z.boolean().optional(),
  showPlanning: z.boolean().optional(),
  showFinance: z.boolean().optional(),
  showDocuments: z.boolean().optional(),
  showMessages: z.boolean().optional(),
  invited: z.boolean().optional(),
});

/** What the client sees through a link, and who the link is for. */
export async function updatePortalLink(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'portal.manage');
  const data = parse(linkSettings, input);
  const columns: Record<string, string> = {
    label: 'label', contactName: 'contact_name', contactEmail: 'contact_email', contactPhone: 'contact_phone', requireCode: 'require_code',
    showPhotos: 'show_photos', showPlanning: 'show_planning', showFinance: 'show_finance', showDocuments: 'show_documents', showMessages: 'show_messages',
  };
  const entries = Object.entries(data).filter(([key, value]) => value !== undefined && columns[key]);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from portal_link where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    const sets = entries.map(([key], index) => `${columns[key]} = $${index + 3}`);
    if (data.invited) sets.push('invited_at = now()');
    if (sets.length) await tx.query(`update portal_link set ${sets.join(', ')} where id = $1 and org_id = $2`, [id, actor.orgId, ...entries.map(([, value]) => value)]);
    await journal(tx, actor, 'portal.link_update', id, before, data);
  });
}

export interface PortalLinkRow {
  id: string; label: string | null; createdAt: string; revokedAt: string | null; lastSeenAt: string | null; contactName: string | null;
  contactEmail: string | null; contactPhone: string | null; requireCode: boolean; showPhotos: boolean; showPlanning: boolean; showFinance: boolean;
  showDocuments: boolean; showMessages: boolean; invitedAt: string | null; firstOpenedAt: string | null;
}

export async function listPortalLinksFull(db: Db, actor: Actor, projectId: string): Promise<PortalLinkRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<PortalLinkRow>(
      `select id, label, created_at as "createdAt", revoked_at as "revokedAt", last_seen_at as "lastSeenAt", contact_name as "contactName",
              contact_email as "contactEmail", contact_phone as "contactPhone", require_code as "requireCode", show_photos as "showPhotos",
              show_planning as "showPlanning", show_finance as "showFinance", show_documents as "showDocuments", show_messages as "showMessages",
              invited_at as "invitedAt", first_opened_at as "firstOpenedAt"
         from portal_link where org_id = $1 and project_id = $2 order by created_at desc`,
      [actor.orgId, projectId],
    );
    return rows;
  });
}
