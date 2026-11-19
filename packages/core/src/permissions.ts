// Pure rules (no database): importable by the browser through `@struo/core/permissions`.
export const ROLES = ['owner', 'admin', 'engineer', 'site_lead', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

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

export const can = (role: Role, permission: Permission) => (PERMISSIONS[permission] as readonly Role[]).includes(role);

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);
