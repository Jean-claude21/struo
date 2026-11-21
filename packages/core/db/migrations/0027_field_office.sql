-- Spec 052: the link between the field and the office.
-- The site lead asks for material from the field (what, how much, for when); the office orders it,
-- marks it delivered or cancels it, and the site lead sees where it stands. Written offline with its
-- own id, sent when the network comes back (idempotent).

create table material_request (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  requested_by text references "user"(id) on delete set null,
  item text not null check (length(item) between 1 and 200),
  quantity text check (length(quantity) <= 80),
  needed_on date,
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'ordered', 'delivered', 'cancelled')),
  office_note text check (length(office_note) <= 500),
  handled_by text references "user"(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index material_request_project_idx on material_request (project_id, created_at desc);
create index material_request_open_idx on material_request (org_id, status);
alter table material_request enable row level security;
create policy material_request_member on material_request using (struo_is_member(org_id)) with check (struo_is_member(org_id));
