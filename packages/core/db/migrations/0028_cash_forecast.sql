-- Spec 053: the money to come. Supplier bills to pay (with their due date), and a cash forecast at
-- 30, 60 and 90 days built from what is recorded: invoices due, bills due, labour and the usual
-- spending at the current pace — from the company's own bank balance when it gives it.

create table supplier_bill (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid,
  supplier text not null check (length(supplier) between 1 and 200),
  label text not null check (length(label) between 1 and 200),
  reference text check (length(reference) <= 120),
  category text not null default 'materials' check (category in
    ('materials', 'labour', 'subcontracting', 'equipment', 'transport', 'fees', 'other')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  issued_on date not null default current_date,
  due_on date not null,
  status text not null default 'to_pay' check (status in ('to_pay', 'paid', 'cancelled')),
  paid_on date,
  expense_id uuid,
  storage_key text,
  media_type text,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index supplier_bill_due_idx on supplier_bill (org_id, status, due_on);
alter table supplier_bill enable row level security;
create policy supplier_bill_member on supplier_bill using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- The company's real bank balance on a day, the forecast's starting point (else: collected − spent).
alter table org_settings
  add column cash_balance_minor bigint,
  add column cash_balance_on date;
