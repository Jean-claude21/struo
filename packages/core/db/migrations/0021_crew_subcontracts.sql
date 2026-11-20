-- Spec 047: who works on which site, and what it costs.
-- Workers are people without an account (masons, ironworkers…): name, trade, phone, day rate.
-- The site lead ticks who is present in the day's report; the labour cost of a site is then
-- an estimate from presences × day rate. Subcontractors (paid by the job) have an agreed amount, a
-- progress, and payments recorded as expenses of the site (category subcontracting), so the margin
-- counts them once.

create table worker (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  trade text check (length(trade) <= 80),
  phone text check (length(phone) <= 40),
  day_rate_minor bigint check (day_rate_minor >= 0),
  active boolean not null default true,
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index worker_org_idx on worker (org_id, active, name);
alter table worker enable row level security;
create policy worker_member on worker using (struo_is_member(org_id)) with check (struo_is_member(org_id));

create table worker_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  worker_id uuid not null,
  day date not null,
  report_id uuid,
  recorded_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, worker_id, day),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade,
  foreign key (worker_id, org_id) references worker (id, org_id) on delete cascade
);
create index worker_attendance_org_day_idx on worker_attendance (org_id, day);
alter table worker_attendance enable row level security;
create policy worker_attendance_member on worker_attendance using (struo_is_member(org_id)) with check (struo_is_member(org_id));

create table subcontract (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 160),
  trade text check (length(trade) <= 80),
  phone text check (length(phone) <= 40),
  agreed_minor bigint not null check (agreed_minor > 0),
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  status text not null default 'open' check (status in ('open', 'closed')),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index subcontract_project_idx on subcontract (project_id);
alter table subcontract enable row level security;
create policy subcontract_member on subcontract using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- A payment to a subcontractor is an expense of the site, linked to its contract.
alter table expense add column subcontract_id uuid references subcontract(id) on delete set null;
create index expense_subcontract_idx on expense (subcontract_id) where subcontract_id is not null;

-- Labour of a site from presences: days worked and their cost at today's day rates.
create view project_labour with (security_invoker = true) as
select a.project_id, a.org_id,
       count(*)::int as days,
       count(distinct a.worker_id)::int as workers,
       coalesce(sum(w.day_rate_minor), 0)::bigint as cost_minor,
       count(*) filter (where w.day_rate_minor is null)::int as days_without_rate
  from worker_attendance a join worker w on w.id = a.worker_id
 group by a.project_id, a.org_id;
