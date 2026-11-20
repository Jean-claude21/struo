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

/**
 * The office screens each role works with (spec 045): a role sees its own part and nothing more.
 * Reading rights stay as they are; this decides what is shown and opened. The site lead works in the
 * field app (/field) and only opens their account in the office.
 */
export const SCREENS = {
  today: ['owner', 'admin', 'engineer', 'accountant'],
  projects: ['owner', 'admin', 'engineer', 'accountant'],
  planning: ['owner', 'admin', 'engineer'],
  tasks: ['owner', 'admin', 'engineer'],
  indicators: ['owner', 'admin', 'engineer', 'accountant'],
  field: ['owner', 'admin', 'engineer'],
  finance: ['owner', 'admin', 'accountant'],
  expenses: ['owner', 'admin', 'engineer', 'accountant'],
  documents: ['owner', 'admin', 'engineer', 'accountant'],
  clients: ['owner', 'admin', 'engineer', 'accountant'],
  team: ['owner', 'admin'],
  intelligence: ['owner', 'admin', 'engineer', 'accountant'],
  settings: ['owner', 'admin'],
  account: ['owner', 'admin', 'engineer', 'site_lead', 'accountant'],
} as const satisfies Record<string, readonly Role[]>;

export type Screen = keyof typeof SCREENS;

export const sees = (role: Role, screen: Screen) => (SCREENS[screen] as readonly Role[]).includes(role);

/** The office screen a path belongs to (/app/finance/… → finance; /app → today). */
export function screenOf(pathname: string): Screen | null {
  const segment = pathname.replace(/^\/app\/?/u, '').split('/')[0] ?? '';
  if (segment === '') return 'today';
  if (segment === 'invoices') return 'finance';
  return segment in SCREENS ? (segment as Screen) : null;
}

/** Where a role starts: the first screen it sees, or the field app for the site lead. */
export const homeOf = (role: Role): string => (role === 'site_lead' ? '/field' : '/app');
