-- Spec 038: the platform console and subscriptions paid with licences sold on a store.
--
-- The platform operator maps each licence product of the store to a plan and a duration; a company
-- pastes the key it bought, the application checks it with the store, and the plan is extended.

-- A company the operator suspended cannot be used until it is reactivated.
alter table org_settings
  add column suspended_at timestamptz,
  add column suspended_reason text check (length(suspended_reason) <= 300);

-- Platform tables: no company data, read and written only by the platform's own connection
-- (row security on, no policy for the application role).
create table platform_license_product (
  product_id text primary key check (product_id ~ '^[A-Za-z0-9_-]{3,80}$'),
  plan_code text not null references plan(code),
  months integer not null check (months between 1 and 60),
  label text not null check (length(label) between 1 and 120),
  buy_url text check (buy_url is null or buy_url ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table platform_license_product enable row level security;

create table platform_journal (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id text not null,
  command text not null,
  target text,
  detail jsonb
);
alter table platform_journal enable row level security;

-- Each licence key is used once, by one company.
create table license_redemption (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  key_hash text not null unique,
  masked_key text not null,
  product_id text not null,
  plan_code text not null,
  months integer not null,
  customer_email text,
  redeemed_by text not null,
  redeemed_at timestamptz not null default now(),
  paid_until timestamptz not null
);
create index license_redemption_org_idx on license_redemption (org_id, redeemed_at desc);
alter table license_redemption enable row level security;
create policy license_redemption_member on license_redemption for select using (struo_is_member(org_id));
