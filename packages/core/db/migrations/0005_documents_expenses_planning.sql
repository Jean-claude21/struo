-- Documents (spec 006), expenses (spec 007) and planning (spec 008).

-- ---------------------------------------------------------------- documents
create table doc_type (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  required boolean not null default true,
  has_expiry boolean not null default false,
  position integer not null default 0,
  unique (org_id, name),
  unique (id, org_id)
);

create table project_document (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  doc_type_id uuid,
  title text not null check (length(title) between 1 and 200),
  -- missing: not received yet · pending: in progress (instruction) · valid: signed/obtained/in order
  -- · to_fix: to regularize. « expired » is computed from expires_on, never stored.
  status text not null default 'missing' check (status in ('missing', 'pending', 'valid', 'to_fix')),
  reference text,
  issued_on date,
  expires_on date,
  storage_key text,
  media_type text,
  size_bytes integer,
  shared_with_client boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade,
  foreign key (doc_type_id, org_id) references doc_type (id, org_id) on delete set null (doc_type_id)
);
create index project_document_project_idx on project_document (project_id);
create index project_document_expiry_idx on project_document (org_id, expires_on) where expires_on is not null;

-- ---------------------------------------------------------------- expenses
create table expense (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  spent_on date not null default current_date,
  category text not null check (category in
    ('materials', 'labour', 'subcontracting', 'equipment', 'transport', 'fees', 'other')),
  supplier text,
  label text not null check (length(label) between 1 and 200),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  storage_key text,
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index expense_project_idx on expense (project_id, spent_on);

-- ---------------------------------------------------------------- planning
create table milestone (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  category text not null default 'technical' check (category in
    ('admin', 'studies', 'technical', 'finishing', 'delivery')),
  planned_on date not null,
  actual_on date,
  note text,
  action text,
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  client_validation boolean not null default false,
  client_validated_at timestamptz,
  client_validated_by text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index milestone_project_idx on milestone (project_id, planned_on);

do $$
declare t text;
begin
  foreach t in array array['doc_type', 'project_document', 'expense', 'milestone'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (struo_is_member(org_id)) with check (struo_is_member(org_id))',
      t || '_member', t);
  end loop;
end $$;

-- A document's status as seen today: an expiry date in the past makes it « expired ».
create view document_status with (security_invoker = true) as
select d.id as document_id,
       d.org_id,
       d.project_id,
       d.doc_type_id,
       coalesce(t.required, false) as required,
       case when d.expires_on is not null and d.expires_on < current_date then 'expired' else d.status end as status,
       case when d.expires_on is null then null else (d.expires_on - current_date) end as days_left
from project_document d
left join doc_type t on t.id = d.doc_type_id;

-- A milestone's status as seen today.
create view milestone_status with (security_invoker = true) as
select m.id as milestone_id,
       m.org_id,
       m.project_id,
       case when m.actual_on is not null then 'done'
            when m.planned_on < current_date then 'late'
            else 'pending' end as status,
       case when m.actual_on is not null then greatest(m.actual_on - m.planned_on, 0)
            when m.planned_on < current_date then current_date - m.planned_on
            else 0 end as delay_days
from milestone m;
