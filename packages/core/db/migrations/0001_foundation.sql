-- Foundation (spec 001, 002): identity tables used by the accounts library, the application role
-- that cannot bypass row-level security, the acting-user context, company settings and the journal.
-- Identity tables are global by nature (an account, a session) and carry no org_id; every company
-- table created from here on carries org_id and its RLS policy in the same migration.

create extension if not exists unaccent;

-- The application role. Its password and LOGIN are set by the migration script from the
-- environment (APP_DB_PASSWORD), never here.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'struo_app') then
    create role struo_app nologin nobypassrls;
  end if;
end $$;
grant usage on schema public to struo_app;
alter default privileges in schema public grant select, insert, update, delete on tables to struo_app;
alter default privileges in schema public grant usage, select on sequences to struo_app;
alter default privileges in schema public grant execute on functions to struo_app;

-- ---------------------------------------------------------------- identity (accounts library)
create table "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table session (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user"(id) on delete cascade,
  "activeOrganizationId" text
);
create index session_user_idx on session ("userId");

create table account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index account_user_idx on account ("userId");

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table organization (
  id text primary key,
  name text not null,
  slug text unique,
  logo text,
  "createdAt" timestamptz not null default now(),
  metadata text
);

create table member (
  id text primary key,
  "organizationId" text not null references organization(id) on delete cascade,
  "userId" text not null references "user"(id) on delete cascade,
  role text not null default 'member',
  "createdAt" timestamptz not null default now(),
  unique ("organizationId", "userId")
);
create index member_user_idx on member ("userId");

create table invitation (
  id text primary key,
  "organizationId" text not null references organization(id) on delete cascade,
  email text not null,
  role text,
  status text not null default 'pending',
  "expiresAt" timestamptz not null,
  "inviterId" text not null references "user"(id) on delete cascade,
  "createdAt" timestamptz not null default now()
);

-- ---------------------------------------------------------------- acting user and membership
-- The acting user, set by the application at the start of each transaction (`struo.user_id`).
create function struo_user() returns text
  language sql stable
  as $$ select nullif(current_setting('struo.user_id', true), '') $$;

-- Whether the acting user is a member of a company: reads `member` past any policy.
create function struo_is_member(target text) returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (
    select 1 from member where "organizationId" = target and "userId" = struo_user()
  ) $$;

-- The acting user's role in a company (null when not a member).
create function struo_role(target text) returns text
  language sql stable security definer set search_path = public
  as $$ select role from member where "organizationId" = target and "userId" = struo_user() $$;

-- ---------------------------------------------------------------- plans (global, read-only)
create table plan (
  code text primary key,
  name text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  max_users integer,
  max_projects integer,
  features jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  public boolean not null default true
);
-- Provisional prices (to be confirmed by the author); limits null = unlimited.
insert into plan (code, name, price_minor, currency_code, max_users, max_projects, features, position) values
  ('trial', 'Essai', 0, 'XOF', 5, 3, '["field","finance","documents","planning"]', 0),
  ('starter', 'Starter', 25000, 'XOF', 5, 3, '["field","finance","documents","planning"]', 1),
  ('pro', 'Pro', 75000, 'XOF', 20, null, '["field","finance","documents","planning","portal","mcp","ai","whatsapp"]', 2),
  ('enterprise', 'Entreprise', 0, 'XOF', null, null, '["field","finance","documents","planning","portal","mcp","ai","whatsapp","dedicated"]', 3);
revoke insert, update, delete on plan from struo_app;

-- ---------------------------------------------------------------- company settings
create table org_settings (
  org_id text primary key references organization(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  vat_bps integer not null default 1800 check (vat_bps between 0 and 10000),
  retention_bps integer not null default 500 check (retention_bps between 0 and 10000),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  time_zone text not null default 'Africa/Lome',
  plan_code text not null default 'trial' references plan(code),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  -- Alert thresholds (spec 009): days before expiry, days of delay, progress/collection gap.
  alert_doc_days integer[] not null default '{30,15,7}',
  alert_late_days integer not null default 7 check (alert_late_days >= 0),
  alert_gap_points integer not null default 10 check (alert_gap_points between 0 and 100),
  brand_color text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);
alter table org_settings enable row level security;
create policy org_settings_member on org_settings
  using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- ---------------------------------------------------------------- journal
create table journal (
  id bigint generated always as identity primary key,
  org_id text not null references organization(id) on delete cascade,
  at timestamptz not null default clock_timestamp(),
  command text not null,
  target text not null,
  before jsonb,
  after jsonb,
  actor text not null,
  door text not null check (door in ('web', 'field', 'api', 'mcp', 'portal', 'job', 'system'))
);
create index journal_org_idx on journal (org_id, id desc);
create index journal_target_idx on journal (target);
alter table journal enable row level security;
create policy journal_read on journal for select using (struo_is_member(org_id));
create policy journal_write on journal for insert with check (struo_is_member(org_id));
-- The journal is append-only for the application.
revoke update, delete on journal from struo_app;

-- Identity tables are reached only by the application (accounts library), never by a client.
grant select, insert, update, delete on "user", session, account, verification, organization, member, invitation to struo_app;
