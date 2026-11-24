import { z } from 'zod';
import type { Db, Tx } from './db.ts';
import { parse } from './access.ts';

/**
 * Spec 060: where a company stands with its trial or licence.
 * - active: nothing to say (or no end: demo, enterprise without period, plan set by the platform);
 * - ending: the end is within the warning window;
 * - grace: the end has passed, everything still works for a few days;
 * - locked: read-only until a new licence (reading, export and renewal stay open).
 */
export type AccessStage = 'active' | 'ending' | 'grace' | 'locked';
export type AccessKind = 'trial' | 'paid';

export interface LicenceSettings { warnDays: number; graceDays: number }

export interface AccessState {
  stage: AccessStage;
  kind: AccessKind | null;
  /** End of the trial or of the paid period (ISO). */
  endsAt: string | null;
  /** End of the grace period (ISO). */
  graceEndsAt: string | null;
  /** Days left before the end (ending) or before read-only (grace). */
  daysLeft: number | null;
}

const DAY = 86_400_000;

/** Pure: the stage of a company at `now`. */
export function accessStage(kind: AccessKind | null, endsAt: Date | string | null, settings: LicenceSettings, now = new Date()): AccessState {
  if (!kind || !endsAt) return { stage: 'active', kind: null, endsAt: null, graceEndsAt: null, daysLeft: null };
  const end = new Date(endsAt);
  const grace = new Date(end.getTime() + settings.graceDays * DAY);
  const base = { kind, endsAt: end.toISOString(), graceEndsAt: grace.toISOString() };
  if (now < end) {
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
    return { ...base, stage: daysLeft <= settings.warnDays ? 'ending' : 'active', daysLeft };
  }
  if (now < grace) return { ...base, stage: 'grace', daysLeft: Math.ceil((grace.getTime() - now.getTime()) / DAY) };
  return { ...base, stage: 'locked', daysLeft: 0 };
}

type Query = Pick<Tx, 'query'> | Db;

/**
 * The SQL that reads a company's period: the trial's end, or the end of the paid period. A demo, or a
 * paying plan the platform set without a period, has no end.
 */
const PERIOD = `
  select case when s.is_demo then null
              when s.plan_code = 'trial' then 'trial'
              when s.paid_until is not null then 'paid' end as kind,
         case when s.plan_code = 'trial' then s.trial_ends_at else s.paid_until end as "endsAt",
         ps.licence_warn_days as "warnDays", ps.licence_grace_days as "graceDays"
    from org_settings s cross join platform_settings ps`;

export async function licenceSettings(q: Query): Promise<LicenceSettings> {
  const { rows } = await q.query<LicenceSettings>('select licence_warn_days as "warnDays", licence_grace_days as "graceDays" from platform_settings');
  return rows[0] ?? { warnDays: 14, graceDays: 7 };
}

/** The founder sets how early companies are warned and how long the grace period lasts. */
export async function setLicenceSettings(owner: Db, adminId: string, input: LicenceSettings): Promise<LicenceSettings> {
  const value = parse(z.object({ warnDays: z.number().int().min(0).max(60), graceDays: z.number().int().min(0).max(90) }), input);
  const before = await licenceSettings(owner);
  await owner.query('update platform_settings set licence_warn_days = $1, licence_grace_days = $2, updated_at = now(), updated_by = $3',
    [value.warnDays, value.graceDays, adminId]);
  await owner.query('insert into platform_journal (admin_id, command, target, detail) values ($1, $2, $3, $4)',
    [adminId, 'licence.settings', 'platform', JSON.stringify({ before, after: value })]);
  return value;
}

/** A company's access state (owner connection, or a member's transaction). */
export async function companyAccess(q: Query, orgId: string, now = new Date()): Promise<AccessState> {
  const { rows } = await q.query<{ kind: AccessKind | null; endsAt: Date | null; warnDays: number; graceDays: number }>(
    `${PERIOD} where s.org_id = $1`, [orgId]);
  const row = rows[0];
  if (!row) return accessStage(null, null, { warnDays: 14, graceDays: 7 }, now);
  return accessStage(row.kind, row.endsAt, row, now);
}

/** Every real company with a period, its contacts and its state, for the notices job. */
export async function licenceNoticeTargets(owner: Db, now = new Date()) {
  const { rows } = await owner.query<{
    orgId: string; orgName: string; locale: 'fr' | 'en'; timeZone: string; emails: string[];
    kind: AccessKind | null; endsAt: Date | null; warnDays: number; graceDays: number;
  }>(
    `${PERIOD.replace('select case', `select o.id as "orgId", o.name as "orgName", s.locale, s.time_zone as "timeZone",
            array(select u.email from member m join "user" u on u.id = m."userId"
                   where m."organizationId" = o.id and m.role in ('owner', 'admin')) as emails,
            case`)}
      join organization o on o.id = s.org_id
     where not s.is_demo and s.suspended_at is null`);
  return rows
    .map(({ kind, endsAt, warnDays, graceDays, ...company }) => ({ ...company, access: accessStage(kind, endsAt, { warnDays, graceDays }, now), warnDays }))
    .filter((company) => company.emails.length && company.access.stage !== 'active');
}

/**
 * The warning a company should receive now, or null. Before the end: one message at the start of the
 * window, then at 7, 3 and 1 days; then one when it has ended, one when it turns read-only. The
 * target names the period, so a new licence starts the sequence again.
 */
export function licenceNotice(access: AccessState, warnDays: number): { stage: AccessStage; target: string } | null {
  if (!access.endsAt) return null;
  const period = access.endsAt.slice(0, 10);
  if (access.stage === 'ending' && access.daysLeft !== null) {
    const steps = [...new Set([warnDays, 7, 3, 1])].filter((step) => step > 0 && step <= warnDays).sort((a, b) => a - b);
    const step = steps.find((candidate) => access.daysLeft! <= candidate);
    return step ? { stage: 'ending', target: `ending:${step}:${period}` } : null;
  }
  if (access.stage === 'grace') return { stage: 'grace', target: `ended:${period}` };
  if (access.stage === 'locked') return { stage: 'locked', target: `locked:${period}` };
  return null;
}

/** Records a notice once for good (not once a day): false when it was already sent. */
export async function markNoticeOnce(owner: Db, orgId: string, target: string): Promise<boolean> {
  const { rowCount } = await owner.query(
    `insert into notification_log (org_id, kind, target, channel)
     select $1, 'licence', $2, 'email' where not exists (select 1 from notification_log where org_id = $1 and kind = 'licence' and target = $2)`,
    [orgId, target]);
  return rowCount === 1;
}
