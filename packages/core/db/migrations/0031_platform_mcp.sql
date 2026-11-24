-- Spec 056: the founder's console through MCP, and features granted to one company.
-- A platform key lets an assistant (Claude, a scheduled routine) reach the console's tools for the
-- admin who created it; it can be read-only. Only its hash is kept. A grant gives one company a
-- feature outside its plan, until a date (a pilot, a commercial gesture), always journaled.

create table platform_api_key (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  key_hash text not null unique,
  masked text not null,
  read_only boolean not null default true,
  created_by text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table platform_api_key enable row level security;
revoke all on platform_api_key from struo_app;

create table company_feature_grant (
  org_id text not null references organization(id) on delete cascade,
  feature text not null check (feature in ('portal', 'ai', 'mcp', 'whatsapp')),
  until date,
  reason text check (length(reason) <= 300),
  granted_by text,
  created_at timestamptz not null default now(),
  primary key (org_id, feature)
);
alter table company_feature_grant enable row level security;
-- Members read their company's grants (the feature checks run as them); only the platform writes.
create policy company_feature_grant_read on company_feature_grant for select using (struo_is_member(org_id));
revoke insert, update, delete on company_feature_grant from struo_app;
