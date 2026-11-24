-- Spec 055: the founder's console.
-- What the platform itself does (jobs, failed sends, demos, sign-ups), follow-up notes on companies,
-- announcements, what users report, plans edited from the console (with their history), and licence
-- products described for buyers. Platform tables: read and written by the owner connection only.

create table platform_event (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('job', 'mail_failed', 'push_failed', 'demo_opened', 'demo_leave', 'signup')),
  name text check (length(name) <= 80),
  ok boolean,
  org_id text references organization(id) on delete cascade,
  detail jsonb
);
create index platform_event_kind_idx on platform_event (kind, at desc);
alter table platform_event enable row level security;
revoke all on platform_event from struo_app;

create table company_note (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  admin_id text references "user"(id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  next_on date,
  created_at timestamptz not null default now()
);
create index company_note_org_idx on company_note (org_id, created_at desc);
alter table company_note enable row level security;
revoke all on company_note from struo_app;

-- A message shown to every company in the app, for a period (and e-mailed to owners when asked).
create table announcement (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text check (length(body) <= 1000),
  level text not null default 'info' check (level in ('info', 'warning')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  emailed_at timestamptz,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now()
);
revoke insert, update, delete on announcement from struo_app;

-- What a member reports from the app (a problem or an idea), read in the console.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  user_id text references "user"(id) on delete set null,
  kind text not null check (kind in ('problem', 'idea')),
  body text not null check (length(body) between 2 and 4000),
  page text check (length(page) <= 300),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_created_idx on feedback (created_at desc);
alter table feedback enable row level security;
create policy feedback_member on feedback using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- Plans edited from the console: words for buyers in both languages, what is highlighted, and the
-- history of every version (restorable).
alter table plan
  add column name_en text check (length(name_en) <= 60),
  add column tagline text check (length(tagline) <= 200),
  add column tagline_en text check (length(tagline_en) <= 200),
  add column bullets text check (length(bullets) <= 3000),
  add column bullets_en text check (length(bullets_en) <= 3000),
  add column highlight boolean not null default false,
  add column updated_at timestamptz;
update plan set highlight = true where code = 'pro';
-- The trial lets a company try everything it could buy.
update plan set features = (select features from plan where code = 'pro') where code = 'trial';

create table plan_revision (
  id bigint generated always as identity primary key,
  plan_code text not null references plan(code) on delete cascade,
  snapshot jsonb not null,
  admin_id text,
  note text check (length(note) <= 300),
  at timestamptz not null default now()
);
create index plan_revision_plan_idx on plan_revision (plan_code, at desc);
alter table plan_revision enable row level security;
revoke all on plan_revision from struo_app;

alter table platform_license_product
  add column description text check (length(description) <= 2000),
  add column description_en text check (length(description_en) <= 2000),
  add column highlight boolean not null default false,
  add column position integer not null default 0;
