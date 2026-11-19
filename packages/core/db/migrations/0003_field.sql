-- Field (spec 004): reports sent from the site (often offline, sent later), their photos and the
-- incidents. Ids are generated on the device: they are the idempotency keys of the sync.

create table site_report (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  phase_id uuid,
  author_id text not null references "user"(id),
  progress_pct integer check (progress_pct between 0 and 100),
  note text check (length(note) <= 4000),
  latitude double precision,
  longitude double precision,
  -- When it was written on the device; created_at is when it reached the server.
  taken_at timestamptz not null,
  created_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted', 'validated', 'rejected')),
  reviewed_by text references "user"(id),
  reviewed_at timestamptz,
  review_note text,
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade,
  foreign key (phase_id, org_id) references project_phase (id, org_id) on delete set null (phase_id)
);
create index site_report_project_idx on site_report (project_id, taken_at desc);
create index site_report_org_status_idx on site_report (org_id, status, taken_at desc);

create table report_photo (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  report_id uuid not null,
  storage_key text not null,
  media_type text not null check (media_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  latitude double precision,
  longitude double precision,
  taken_at timestamptz not null,
  shared_with_client boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (report_id, org_id) references site_report (id, org_id) on delete cascade
);
create index report_photo_report_idx on report_photo (report_id);

create table incident (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  report_id uuid,
  kind text not null check (kind in ('material_delay', 'weather', 'defect', 'accident', 'equipment', 'other')),
  priority text not null check (priority in ('critical', 'important', 'info')),
  description text not null check (length(description) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index incident_org_open_idx on incident (org_id, status, priority);

do $$
declare t text;
begin
  foreach t in array array['site_report', 'report_photo', 'incident'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (struo_is_member(org_id)) with check (struo_is_member(org_id))',
      t || '_member', t);
  end loop;
end $$;
