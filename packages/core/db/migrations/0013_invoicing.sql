-- Spec 035: invoices as a building company issues them.
--
-- An invoice is written as a draft (its lines, rates and deductions can change), then issued: it gets
-- its number from the company's series and is frozen. Lines are priced items (quantity × unit price),
-- progress lines of a progress statement (contract amount × cumulative %, minus what was already
-- invoiced) or text. Amounts are computed by the database, never by the browser.

-- ---------------------------------------------------------------- the company's invoicing settings
create table invoice_settings (
  org_id text primary key references organization(id) on delete cascade,
  number_prefix text not null default 'F' check (length(number_prefix) between 1 and 12),
  number_padding integer not null default 4 check (number_padding between 2 and 8),
  number_yearly boolean not null default true,
  legal_name text check (length(legal_name) <= 200),
  tax_id text check (length(tax_id) <= 60),
  trade_register text check (length(trade_register) <= 80),
  address text check (length(address) <= 400),
  phone text check (length(phone) <= 60),
  email text check (length(email) <= 200),
  bank_details text check (length(bank_details) <= 600),
  mobile_money text check (length(mobile_money) <= 300),
  payment_terms text check (length(payment_terms) <= 600),
  footer text check (length(footer) <= 600),
  due_days integer not null default 30 check (due_days between 0 and 365),
  updated_at timestamptz not null default now()
);
alter table invoice_settings enable row level security;
create policy invoice_settings_member on invoice_settings using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- ---------------------------------------------------------------- invoice header
alter table invoice
  add column contract_ref text check (length(contract_ref) <= 120),
  add column order_ref text check (length(order_ref) <= 120),
  add column notes text check (length(notes) <= 2000),
  add column terms text check (length(terms) <= 1000),
  add column vat_exempt_reason text check (length(vat_exempt_reason) <= 200),
  add column other_deductions_minor bigint not null default 0 check (other_deductions_minor >= 0),
  add column issued_at timestamptz;

-- The net now also takes off the complementary deductions (tax withheld, penalties…).
alter table invoice alter column net_minor set expression as (
  amount_minor + (amount_minor * vat_bps + 5000) / 10000
  - ((amount_minor + (amount_minor * vat_bps + 5000) / 10000) * retention_bps + 5000) / 10000
  - deduction_minor - other_deductions_minor);
alter table invoice add constraint invoice_net_not_negative check (
  deduction_minor + other_deductions_minor <= amount_minor + (amount_minor * vat_bps + 5000) / 10000);

-- ---------------------------------------------------------------- lines
create table invoice_line (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  invoice_id uuid not null,
  position integer not null default 0,
  kind text not null check (kind in ('item', 'progress', 'text')),
  section text check (length(section) <= 120),
  designation text not null check (length(designation) between 1 and 500),
  unit text check (length(unit) <= 20),
  -- An item: quantity in thousandths (2.5 m³ = 2500) times a unit price.
  quantity_milli bigint not null default 0 check (quantity_milli >= 0),
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  -- A progress line: the contract amount of the lot, the cumulative progress (basis points), what
  -- earlier statements already invoiced for it; it invoices the difference.
  phase_id uuid,
  contract_minor bigint not null default 0 check (contract_minor >= 0),
  cumulative_bps integer not null default 0 check (cumulative_bps between 0 and 10000),
  previous_minor bigint not null default 0,
  amount_minor bigint generated always as (
    case kind
      when 'item' then (quantity_milli * unit_price_minor + 500) / 1000
      when 'progress' then (contract_minor * cumulative_bps + 5000) / 10000 - previous_minor
      else 0 end) stored,
  foreign key (invoice_id, org_id) references invoice (id, org_id) on delete cascade
);
create index invoice_line_invoice_idx on invoice_line (invoice_id, position);
create index invoice_line_phase_idx on invoice_line (phase_id) where phase_id is not null;
alter table invoice_line enable row level security;
create policy invoice_line_member on invoice_line using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- ---------------------------------------------------------------- complementary deductions
create table invoice_adjustment (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  invoice_id uuid not null,
  position integer not null default 0,
  label text not null check (length(label) between 1 and 200),
  -- A rate on a base (before or after VAT), or a fixed amount; the amount is kept as computed.
  rate_bps integer check (rate_bps is null or rate_bps between 0 and 10000),
  base text not null default 'ht' check (base in ('ht', 'ttc')),
  amount_minor bigint not null check (amount_minor >= 0),
  foreign key (invoice_id, org_id) references invoice (id, org_id) on delete cascade
);
create index invoice_adjustment_invoice_idx on invoice_adjustment (invoice_id, position);
alter table invoice_adjustment enable row level security;
create policy invoice_adjustment_member on invoice_adjustment using (struo_is_member(org_id)) with check (struo_is_member(org_id));
