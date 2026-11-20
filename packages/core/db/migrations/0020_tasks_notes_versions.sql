-- Spec 046: work the team shares on a site.
-- Tasks assigned to a person with a due date; an internal thread per site (never shown to the client);
-- the previous files of a document, kept when a new file replaces them.

create table project_task (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  note text check (length(note) <= 2000),
  assignee_id text references "user"(id) on delete set null,
  due_on date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index project_task_org_status_idx on project_task (org_id, status, due_on);
create index project_task_project_idx on project_task (project_id, status);
alter table project_task enable row level security;
create policy project_task_member on project_task using (struo_is_member(org_id)) with check (struo_is_member(org_id));

create table project_note (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  author_id text not null references "user"(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index project_note_project_idx on project_note (project_id, created_at desc);
alter table project_note enable row level security;
create policy project_note_member on project_note using (struo_is_member(org_id)) with check (struo_is_member(org_id));

create table document_version (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  document_id uuid not null references project_document(id) on delete cascade,
  storage_key text not null,
  media_type text,
  size_bytes bigint,
  replaced_at timestamptz not null default now(),
  replaced_by text references "user"(id) on delete set null
);
create index document_version_doc_idx on document_version (document_id, replaced_at desc);
alter table document_version enable row level security;
create policy document_version_member on document_version using (struo_is_member(org_id)) with check (struo_is_member(org_id));
