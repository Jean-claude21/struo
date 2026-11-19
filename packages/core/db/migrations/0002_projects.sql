-- Projects (spec 003): the company's configuration (project types, phase templates), its clients,
-- its projects and their phases. Every table: org_id + RLS policy, here.

create table project_type (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  position integer not null default 0,
  archived_at timestamptz,
  unique (org_id, name)
);

create table phase_template (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  position integer not null default 0,
  unique (org_id, name)
);

create table client (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  kind text not null default 'individual' check (kind in ('individual', 'company', 'public')),
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
create index client_org_idx on client (org_id, name);

create table project (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  code text not null check (length(code) between 1 and 30),
  name text not null check (length(name) between 1 and 200),
  type_id uuid references project_type(id) on delete set null,
  client_id uuid,
  manager_id text references "user"(id) on delete set null,
  location text,
  latitude double precision,
  longitude double precision,
  start_date date,
  end_date date,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'done')),
  budget_minor bigint not null default 0 check (budget_minor >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  vat_bps integer not null check (vat_bps between 0 and 10000),
  retention_bps integer not null check (retention_bps between 0 and 10000),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, code),
  unique (id, org_id),
  foreign key (client_id, org_id) references client (id, org_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index project_org_status_idx on project (org_id, status) where archived_at is null;

create table project_phase (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  position integer not null default 0,
  budget_minor bigint not null default 0 check (budget_minor >= 0),
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index project_phase_project_idx on project_phase (project_id, position);

do $$
declare t text;
begin
  foreach t in array array['project_type', 'phase_template', 'client', 'project', 'project_phase'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (struo_is_member(org_id)) with check (struo_is_member(org_id))',
      t || '_member', t);
  end loop;
end $$;

-- Progress of a project: phases weighted by their budget, or a plain average when no phase has a
-- budget. Computed, never stored.
create view project_progress with (security_invoker = true) as
select p.id as project_id,
       p.org_id,
       coalesce(
         case when sum(ph.budget_minor) > 0
              then round(sum(ph.progress_pct::numeric * ph.budget_minor) / sum(ph.budget_minor))
              else round(avg(ph.progress_pct)) end,
         0)::integer as progress_pct
from project p
left join project_phase ph on ph.project_id = p.id
group by p.id, p.org_id;
