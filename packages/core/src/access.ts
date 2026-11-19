import { ROLES, asUser, type Actor, type Db, type Door, type Role, type Tx } from './db.ts';
import { DomainError, forbidden } from './errors.ts';

/** What each role may do. Reading a company's data is open to every member; writing is not. */
export const PERMISSIONS = {
  'org.manage': ['owner', 'admin'],
  'members.manage': ['owner', 'admin'],
  'projects.write': ['owner', 'admin', 'engineer'],
  'clients.write': ['owner', 'admin', 'engineer', 'accountant'],
  'field.report': ['owner', 'admin', 'engineer', 'site_lead'],
  'field.review': ['owner', 'admin', 'engineer'],
  'finance.read': ['owner', 'admin', 'accountant', 'engineer'],
  'finance.write': ['owner', 'admin', 'accountant'],
  'documents.write': ['owner', 'admin', 'engineer', 'accountant'],
  'expenses.write': ['owner', 'admin', 'accountant', 'engineer'],
  'planning.write': ['owner', 'admin', 'engineer'],
  'portal.manage': ['owner', 'admin', 'engineer'],
  'messages.write': ['owner', 'admin', 'engineer', 'accountant'],
  'apikeys.manage': ['owner', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission) =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);

export function ensure(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) throw forbidden();
}

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/**
 * The acting member of `orgId`, read under the user's own row-level security. `null` when the
 * user is not a member (or their role is unknown).
 */
export async function resolveActor(db: Db, userId: string, orgId: string, door: Door): Promise<Actor | null> {
  const role = await asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ role: string | null }>('select struo_role($1) as role', [orgId]);
    return rows[0]?.role ?? null;
  });
  return isRole(role) ? { userId, orgId, role, door } : null;
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
