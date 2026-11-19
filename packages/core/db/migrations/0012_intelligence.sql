-- Spec 034: Struo Intelligence.
-- The in-app assistant acts through its own door, so the journal tells it apart from a person.
alter table journal drop constraint if exists journal_door_check;
alter table journal add constraint journal_door_check
  check (door in ('web', 'field', 'api', 'mcp', 'portal', 'job', 'system', 'ai'));

-- Who pays the model: the company for everyone, a person's own connection if she has one, or hers only.
alter table org_settings
  add column ai_policy text not null default 'allowed' check (ai_policy in ('company', 'allowed', 'required')),
  add column ai_budget_cents integer check (ai_budget_cents is null or ai_budget_cents >= 0);

-- A person's own model connection in a company: her API key, or her plan signed in with the
-- provider (access and refresh tokens). Secrets are sealed by the application; only a hint shows.
create table ai_connection (
  org_id text not null references organization(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('api_key', 'plan')),
  provider text not null check (length(provider) between 2 and 40),
  model text check (model is null or length(model) <= 80),
  secret_sealed text not null,
  refresh_sealed text,
  expires_at timestamptz,
  hint text not null check (length(hint) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table ai_connection enable row level security;
-- Only its owner reads or changes it, inside a company she belongs to.
create policy ai_connection_own on ai_connection
  using (user_id = struo_user() and struo_is_member(org_id))
  with check (user_id = struo_user() and struo_is_member(org_id));

-- What each turn cost, and who paid.
create table ai_usage (
  id bigint generated always as identity primary key,
  org_id text not null references organization(id) on delete cascade,
  user_id text not null,
  at timestamptz not null default now(),
  payer text not null check (payer in ('company', 'personal', 'plan')),
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_microusd bigint not null default 0 check (cost_microusd >= 0),
  tools integer not null default 0
);
create index ai_usage_org_idx on ai_usage (org_id, at desc);
alter table ai_usage enable row level security;
create policy ai_usage_member on ai_usage using (struo_is_member(org_id)) with check (struo_is_member(org_id));
