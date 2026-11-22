import { asUser, type Actor, type Db, type Door, type Tx } from './db.ts';
import { can, isRole, type Permission } from './permissions.ts';
import { DomainError, forbidden } from './errors.ts';
import { companyAccess } from './licence.ts';

export { PERMISSIONS, SCREENS, can, homeOf, isRole, screenOf, sees, type Permission, type Screen } from './permissions.ts';

/**
 * What stays open in a read-only space (spec 060): reading the books, and the settings where a new
 * licence is entered. Everything else that writes is refused until the company renews.
 */
const OPEN_WHEN_LOCKED: ReadonlySet<Permission> = new Set<Permission>(['finance.read', 'cash.read', 'org.manage']);

export function ensure(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw forbidden();
  if (actor.locked && !OPEN_WHEN_LOCKED.has(permission)) throw new DomainError('licence_locked', 403);
}

/**
 * The acting member of `orgId`, read under the user's own row-level security. `null` when the
 * user is not a member (or their role is unknown).
 */
export async function resolveActor(db: Db, userId: string, orgId: string, door: Door): Promise<Actor | null> {
  const found = await asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ role: string | null; suspended: string | null }>(
      'select struo_role($1) as role, (select suspended_at from org_settings where org_id = $1) as suspended', [orgId]);
    const row = rows[0] ?? null;
    // Spec 060: after the grace period the space is read-only (computed under the member's own rights).
    return row && isRole(row.role) ? { ...row, locked: (await companyAccess(tx, orgId)).stage === 'locked' } : row;
  });
  if (!found || !isRole(found.role)) return null;
  const locked = 'locked' in found && Boolean(found.locked);
  // A company the platform suspended cannot be used until it is reactivated (spec 038).
  if (found.suspended) throw new DomainError('company_suspended', 403);
  return locked ? { userId, orgId, role: found.role, door, locked } : { userId, orgId, role: found.role, door };
}

/** Runs work as the actor, in their company. */
export const asActor = <T>(db: Db, actor: Actor, work: (tx: Tx) => Promise<T>) => asUser(db, actor.userId, work);

/** Journal row: who did what, before and after, through which door (constitution IV). */
export async function journal(
  tx: Tx,
  actor: Pick<Actor, 'orgId' | 'userId' | 'door'>,
  command: string,
  target: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.query(
    `insert into journal (org_id, command, target, before, after, actor, door)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [actor.orgId, command, target, before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after), actor.userId, actor.door],
  );
}

/** Parses input with a Zod-like schema and turns failures into a 422 the doors can show. */
export function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new DomainError('invalid_input', 422, {
    field: issue ? issue.path.map(String).join('.') : '',
    detail: issue?.message ?? '',
  });
}
