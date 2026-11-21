import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { assertFeature } from './founder.ts';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a portal link for a project. The token is returned once and only its hash is kept. */
export async function createPortalLink(db: Db, actor: Actor, projectId: string, label?: string): Promise<{ id: string; token: string }> {
  ensure(actor, 'portal.manage');
  const token = randomBytes(24).toString('base64url');
  return asActor(db, actor, async (tx) => {
    const project = await tx.query('select 1 from project where id = $1 and org_id = $2', [projectId, actor.orgId]);
    if (!project.rowCount) throw notFound();
    // Spec 055: the client space is a feature of the company's plan.
    await assertFeature(tx, actor.orgId, 'portal');
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
  photos: { id: string; takenAt: string; note: string | null; phase: string | null }[];
  documents: { id: string; title: string; hasFile: boolean }[];
  invoices: { id: string; number: string; kind: string; issuedOn: string; dueOn: string; net: number; paid: number; balance: number; currency: string }[];
  messages: { authorKind: 'team' | 'client'; authorName: string; body: string; at: string }[];
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
  showFieldReports: z.boolean().optional(),
  invited: z.boolean().optional(),
});

/** What the client sees through a link, and who the link is for. */
export async function updatePortalLink(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'portal.manage');
  const data = parse(linkSettings, input);
  const columns: Record<string, string> = {
    label: 'label', contactName: 'contact_name', contactEmail: 'contact_email', contactPhone: 'contact_phone', requireCode: 'require_code',
    showPhotos: 'show_photos', showPlanning: 'show_planning', showFinance: 'show_finance', showDocuments: 'show_documents', showMessages: 'show_messages', showFieldReports: 'show_field_reports',
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
  showDocuments: boolean; showMessages: boolean; showFieldReports: boolean; invitedAt: string | null; firstOpenedAt: string | null;
}

export async function listPortalLinksFull(db: Db, actor: Actor, projectId: string): Promise<PortalLinkRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<PortalLinkRow>(
      `select id, label, created_at as "createdAt", revoked_at as "revokedAt", last_seen_at as "lastSeenAt", contact_name as "contactName",
              contact_email as "contactEmail", contact_phone as "contactPhone", require_code as "requireCode", show_photos as "showPhotos",
              show_planning as "showPlanning", show_finance as "showFinance", show_documents as "showDocuments", show_messages as "showMessages", show_field_reports as "showFieldReports",
              invited_at as "invitedAt", first_opened_at as "firstOpenedAt"
         from portal_link where org_id = $1 and project_id = $2 order by created_at desc`,
      [actor.orgId, projectId],
    );
    return rows;
  });
}
