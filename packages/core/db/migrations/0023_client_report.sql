-- Spec 049: the client report and the notifications.
-- The report is built from what is recorded (validated progress, photos, milestones, change orders),
-- in the company's own look (the invoice look: logo, colour, font), sent by e-mail with a link to the
-- client's space, weekly or on demand. Costs and margins are never in it.

alter table invoice_settings
  add column report_intro text check (length(report_intro) <= 1000),
  add column report_photos integer not null default 8 check (report_photos between 0 and 24),
  add column report_show_progress boolean not null default true,
  add column report_show_milestones boolean not null default true,
  add column report_show_changes boolean not null default true,
  add column report_weekly boolean not null default false;

-- The client's link kept sealed (encrypted by the application), so that later messages to the client
-- (a report, a change order to approve) can carry it. Links made before this spec have none.
alter table portal_link add column token_enc text check (length(token_enc) <= 600);

create table client_report (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  note text check (length(note) <= 2000),
  sent_to text check (length(sent_to) <= 254),
  sent_at timestamptz,
  automatic boolean not null default false,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index client_report_project_idx on client_report (project_id, created_at desc);
alter table client_report enable row level security;
create policy client_report_member on client_report using (struo_is_member(org_id)) with check (struo_is_member(org_id));
