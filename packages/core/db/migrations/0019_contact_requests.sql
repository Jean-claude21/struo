-- Spec 045: a prospect leaves a way to be called back from the public site. Platform data (no
-- company yet): written and read only through the platform's own connection, like platform_journal.
create table contact_request (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  company text not null check (length(company) between 1 and 160),
  reach text not null check (length(reach) between 3 and 160),
  active_sites integer check (active_sites between 0 and 10000),
  message text check (length(message) <= 2000),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  locale text not null default 'fr',
  handled_at timestamptz,
  handled_by text
);
alter table contact_request enable row level security;
create index contact_request_created on contact_request (created_at desc);
