-- Spec 069: the store tells Struo about each licence it issues (Chariow « Pulses », signed webhooks).
-- One row per delivery: retries of the same delivery are recognised and do nothing twice; the founder
-- sees in the console what arrived and what Struo did with it. Platform data only (no company column):
-- written and read through the platform's own connection.
create table store_pulse (
  delivery_id text primary key check (length(delivery_id) between 1 and 200),
  event text not null check (length(event) <= 80),
  received_at timestamptz not null default now(),
  outcome text not null default 'received' check (outcome in ('received', 'applied', 'already', 'unmatched', 'ignored', 'failed')),
  buyer_email text,
  product_id text,
  company_name text,
  detail text check (length(detail) <= 500)
);
create index store_pulse_received_idx on store_pulse (received_at desc);
revoke all on store_pulse from struo_app;
