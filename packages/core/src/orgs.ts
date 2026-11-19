import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ensure, isRole, journal, parse, asActor } from './access.ts';
import { asUser, type Actor, type Db, type Role } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { assertWithinLimit } from './saas.ts';

export interface OrgSettings {
  orgId: string;
  name: string;
  countryCode: string;
  currencyCode: string;
  vatBps: number;
  retentionBps: number;
  locale: 'fr' | 'en';
  timeZone: string;
  planCode: string;
  trialEndsAt: string;
  alertDocDays: number[];
  alertLateDays: number;
  alertGapPoints: number;
  brandColor: string | null;
}

const companyInput = z.object({
  name: z.string().trim().min(2).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/u),
  currencyCode: z.string().regex(/^[A-Z]{3}$/u),
  vatBps: z.number().int().min(0).max(10000),
  retentionBps: z.number().int().min(0).max(10000),
  locale: z.enum(['fr', 'en']),
});

const slugOf = (name: string) =>
  `${name
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 40)}-${randomBytes(3).toString('hex')}`;

/**
 * Creates a company: the organization, its first member (owner), its settings and its default
 * trade configuration in its language — one transaction.
 */
export async function createCompany(db: Db, userId: string, input: unknown): Promise<{ orgId: string }> {
  const data = parse(companyInput, input);
  const orgId = randomUUID();
  return asUser(db, userId, async (tx) => {
    await tx.query('insert into organization (id, name, slug) values ($1, $2, $3)', [orgId, data.name, slugOf(data.name)]);
    await tx.query('insert into member (id, "organizationId", "userId", role) values ($1, $2, $3, $4)', [
      randomUUID(), orgId, userId, 'owner',
    ]);
    await tx.query(
      `insert into org_settings (org_id, country_code, currency_code, vat_bps, retention_bps, locale)
       values ($1, $2, $3, $4, $5, $6)`,
      [orgId, data.countryCode, data.currencyCode, data.vatBps, data.retentionBps, data.locale],
    );
    await tx.query('select struo_seed_org_defaults($1, $2)', [orgId, data.locale]);
    await journal(tx, { orgId, userId, door: 'web' }, 'company.create', orgId, null, data);
    return { orgId };
  });
}

/** The companies a user belongs to, with their role. */
export async function listCompanies(db: Db, userId: string): Promise<{ id: string; name: string; role: Role }[]> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; name: string; role: string }>(
      `select o.id, o.name, m.role from member m join organization o on o.id = m."organizationId"
        where m."userId" = $1 order by m."createdAt"`,
      [userId],
    );
    return rows.filter((row) => isRole(row.role)) as { id: string; name: string; role: Role }[];
  });
}

export async function getSettings(db: Db, actor: Actor): Promise<OrgSettings> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<OrgSettings>(
      `select s.org_id as "orgId", o.name, s.country_code as "countryCode", s.currency_code as "currencyCode",
              s.vat_bps as "vatBps", s.retention_bps as "retentionBps", s.locale, s.time_zone as "timeZone",
              s.plan_code as "planCode", s.trial_ends_at as "trialEndsAt", s.alert_doc_days as "alertDocDays",
              s.alert_late_days as "alertLateDays", s.alert_gap_points as "alertGapPoints",
              s.brand_color as "brandColor"
         from org_settings s join organization o on o.id = s.org_id where s.org_id = $1`,
      [actor.orgId],
    );
    const settings = rows[0];
    if (!settings) throw notFound();
    return settings;
  });
}

const settingsPatch = z
  .object({
    name: z.string().trim().min(2).max(120),
    countryCode: z.string().regex(/^[A-Z]{2}$/u),
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    vatBps: z.number().int().min(0).max(10000),
    retentionBps: z.number().int().min(0).max(10000),
    locale: z.enum(['fr', 'en']),
    alertDocDays: z.array(z.number().int().min(1).max(365)).min(1).max(5),
    alertLateDays: z.number().int().min(0).max(365),
    alertGapPoints: z.number().int().min(0).max(100),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/u).nullable(),
  })
  .partial();

export async function updateSettings(db: Db, actor: Actor, input: unknown): Promise<OrgSettings> {
  ensure(actor, 'org.manage');
  const patch = parse(settingsPatch, input);
  const before = await getSettings(db, actor);
  await asActor(db, actor, async (tx) => {
    if (patch.name) await tx.query('update organization set name = $2 where id = $1', [actor.orgId, patch.name]);
    const columns: [string, unknown][] = [
      ['country_code', patch.countryCode], ['currency_code', patch.currencyCode], ['vat_bps', patch.vatBps],
      ['retention_bps', patch.retentionBps], ['locale', patch.locale], ['alert_doc_days', patch.alertDocDays],
      ['alert_late_days', patch.alertLateDays], ['alert_gap_points', patch.alertGapPoints],
      ['brand_color', patch.brandColor],
    ];
    const set = columns.filter(([, value]) => value !== undefined);
    if (set.length) {
      await tx.query(
        `update org_settings set ${set.map(([column], index) => `${column} = $${index + 2}`).join(', ')} where org_id = $1`,
        [actor.orgId, ...set.map(([, value]) => value)],
      );
    }
    await journal(tx, actor, 'settings.update', actor.orgId, before, patch);
  });
  return getSettings(db, actor);
}

// ---------------------------------------------------------------- trade configuration

export interface Configuration {
  projectTypes: { id: string; name: string }[];
  phases: { id: string; name: string; position: number }[];
  docTypes: { id: string; name: string; required: boolean; hasExpiry: boolean }[];
}

export async function getConfiguration(db: Db, actor: Actor): Promise<Configuration> {
  return asActor(db, actor, async (tx) => {
    const [types, phases, docs] = await Promise.all([
      tx.query('select id, name from project_type where org_id = $1 and archived_at is null order by position, name', [actor.orgId]),
      tx.query('select id, name, position from phase_template where org_id = $1 order by position, name', [actor.orgId]),
      tx.query(
        `select id, name, required, has_expiry as "hasExpiry" from doc_type where org_id = $1 order by position, name`,
        [actor.orgId],
      ),
    ]);
    return { projectTypes: types.rows, phases: phases.rows, docTypes: docs.rows };
  });
}

const configItem = z.object({
  kind: z.enum(['projectType', 'phase', 'docType']),
  name: z.string().trim().min(1).max(80),
  required: z.boolean().optional(),
  hasExpiry: z.boolean().optional(),
});

export async function addConfigurationItem(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'org.manage');
  const item = parse(configItem, input);
  await asActor(db, actor, async (tx) => {
    const table = item.kind === 'projectType' ? 'project_type' : item.kind === 'phase' ? 'phase_template' : 'doc_type';
    const { rows } = await tx.query<{ next: number }>(
      `select coalesce(max(position), 0) + 1 as next from ${table} where org_id = $1`,
      [actor.orgId],
    );
    const position = rows[0]?.next ?? 1;
    try {
      if (item.kind === 'docType') {
        await tx.query(
          'insert into doc_type (org_id, name, required, has_expiry, position) values ($1, $2, $3, $4, $5)',
          [actor.orgId, item.name, item.required ?? true, item.hasExpiry ?? false, position],
        );
      } else {
        await tx.query(`insert into ${table} (org_id, name, position) values ($1, $2, $3)`, [actor.orgId, item.name, position]);
      }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new DomainError('already_exists', 409);
      throw error;
    }
    await journal(tx, actor, 'configuration.add', table, null, item);
  });
}

export async function removeConfigurationItem(
  db: Db,
  actor: Actor,
  kind: 'projectType' | 'phase' | 'docType',
  id: string,
): Promise<void> {
  ensure(actor, 'org.manage');
  await asActor(db, actor, async (tx) => {
    if (kind === 'projectType') {
      await tx.query('update project_type set archived_at = now() where id = $1 and org_id = $2', [id, actor.orgId]);
    } else {
      const table = kind === 'phase' ? 'phase_template' : 'doc_type';
      await tx.query(`delete from ${table} where id = $1 and org_id = $2`, [id, actor.orgId]);
    }
    await journal(tx, actor, 'configuration.remove', id, { kind }, null);
  });
}

// ---------------------------------------------------------------- members and invitations

export interface MemberRow {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export async function listMembers(db: Db, actor: Actor): Promise<MemberRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<MemberRow>(
      `select m.id as "memberId", u.id as "userId", u.name, u.email, m.role, m."createdAt" as "createdAt"
         from member m join "user" u on u.id = m."userId"
        where m."organizationId" = $1 order by m."createdAt"`,
      [actor.orgId],
    );
    return rows;
  });
}

const roleSchema = z.enum(['owner', 'admin', 'engineer', 'site_lead', 'accountant']);

export async function setMemberRole(db: Db, actor: Actor, memberId: string, role: unknown): Promise<void> {
  ensure(actor, 'members.manage');
  const next = parse(roleSchema, role);
  await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ role: string }>(
      'select role from member where id = $1 and "organizationId" = $2 for update',
      [memberId, actor.orgId],
    );
    const current = rows[0];
    if (!current) throw notFound();
    if (current.role === 'owner' && next !== 'owner') await assertAnotherOwner(tx, actor.orgId, memberId);
    if ((next === 'owner' || current.role === 'owner') && actor.role !== 'owner') throw new DomainError('forbidden', 403);
    await tx.query('update member set role = $2 where id = $1', [memberId, next]);
    await journal(tx, actor, 'member.role', memberId, { role: current.role }, { role: next });
  });
}

export async function removeMember(db: Db, actor: Actor, memberId: string): Promise<void> {
  ensure(actor, 'members.manage');
  await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ role: string; userId: string }>(
      'select role, "userId" from member where id = $1 and "organizationId" = $2 for update',
      [memberId, actor.orgId],
    );
    const current = rows[0];
    if (!current) throw notFound();
    if (current.role === 'owner') await assertAnotherOwner(tx, actor.orgId, memberId);
    await tx.query('delete from member where id = $1', [memberId]);
    await journal(tx, actor, 'member.remove', memberId, current, null);
  });
}

async function assertAnotherOwner(tx: import('./db.ts').Tx, orgId: string, exceptMemberId: string) {
  const { rows } = await tx.query<{ count: number }>(
    `select count(*)::int as count from member where "organizationId" = $1 and role = 'owner' and id <> $2`,
    [orgId, exceptMemberId],
  );
  if ((rows[0]?.count ?? 0) === 0) throw new DomainError('last_owner', 409);
}

const invitationInput = z.object({ email: z.string().trim().toLowerCase().email(), role: roleSchema });

/** Invites someone by e-mail; returns the invitation id that forms the link. Valid 7 days. */
export async function inviteMember(db: Db, actor: Actor, input: unknown): Promise<{ id: string; email: string }> {
  ensure(actor, 'members.manage');
  const data = parse(invitationInput, input);
  if (data.role === 'owner' && actor.role !== 'owner') throw new DomainError('forbidden', 403);
  return asActor(db, actor, async (tx) => {
    await assertWithinLimit(tx, actor.orgId, 'users');
    const id = randomBytes(18).toString('base64url');
    await tx.query(
      `insert into invitation (id, "organizationId", email, role, status, "expiresAt", "inviterId")
       values ($1, $2, $3, $4, 'pending', now() + interval '7 days', $5)`,
      [id, actor.orgId, data.email, data.role, actor.userId],
    );
    await journal(tx, actor, 'member.invite', data.email, null, { role: data.role });
    return { id, email: data.email };
  });
}

export async function listInvitations(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select id, email, role, status, "expiresAt" as "expiresAt" from invitation
        where "organizationId" = $1 and status = 'pending' and "expiresAt" > now() order by "createdAt" desc`,
      [actor.orgId],
    );
    return rows as { id: string; email: string; role: Role; status: string; expiresAt: string }[];
  });
}

export async function revokeInvitation(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'members.manage');
  await asActor(db, actor, async (tx) => {
    await tx.query(`update invitation set status = 'canceled' where id = $1 and "organizationId" = $2`, [id, actor.orgId]);
    await journal(tx, actor, 'member.invite_revoke', id, null, null);
  });
}

/** What an invitation link shows before it is accepted. */
export async function readInvitation(db: Db, userId: string, id: string) {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ email: string; role: string; orgName: string; status: string; expired: boolean }>(
      `select i.email, i.role, o.name as "orgName", i.status, i."expiresAt" < now() as expired
         from invitation i join organization o on o.id = i."organizationId" where i.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });
}

/** Accepts an invitation addressed to this user's e-mail. */
export async function acceptInvitation(db: Db, userId: string, id: string): Promise<{ orgId: string }> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ orgId: string; email: string; role: string; status: string; expired: boolean; userEmail: string }>(
      `select i."organizationId" as "orgId", i.email, i.role, i.status, i."expiresAt" < now() as expired,
              (select email from "user" where id = $2) as "userEmail"
         from invitation i where i.id = $1 for update`,
      [id, userId],
    );
    const invitation = rows[0];
    if (!invitation || invitation.status !== 'pending' || invitation.expired) throw new DomainError('invitation_invalid', 409);
    if (invitation.email.toLowerCase() !== invitation.userEmail.toLowerCase()) throw new DomainError('invitation_other_email', 403);
    await tx.query(
      `insert into member (id, "organizationId", "userId", role) values ($1, $2, $3, $4)
       on conflict ("organizationId", "userId") do nothing`,
      [randomUUID(), invitation.orgId, userId, invitation.role],
    );
    await tx.query(`update invitation set status = 'accepted' where id = $1`, [id]);
    await journal(tx, { orgId: invitation.orgId, userId, door: 'web' }, 'member.join', userId, null, { role: invitation.role });
    return { orgId: invitation.orgId };
  });
}
