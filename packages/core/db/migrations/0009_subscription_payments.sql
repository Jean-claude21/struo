-- Subscription payments (spec 017): a company pays its plan online to the Struo platform account.
-- The plan applies when the provider confirms; the period extends « paid until ».
alter table org_settings add column paid_until timestamptz;

create table subscription_payment (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  plan_code text not null references plan(code),
  months integer not null check (months in (1, 3, 6, 12)),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  provider text not null,
  provider_ref text,
  checkout_url text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index subscription_payment_org_idx on subscription_payment (org_id, created_at desc);
create unique index subscription_payment_provider_ref_idx on subscription_payment (provider, provider_ref)
  where provider_ref is not null;
alter table subscription_payment enable row level security;
create policy subscription_payment_member on subscription_payment
  using (struo_is_member(org_id)) with check (struo_is_member(org_id));
-- Only the platform (owner connection) settles a payment: the application role cannot mark it paid.
revoke update, delete on subscription_payment from struo_app;
