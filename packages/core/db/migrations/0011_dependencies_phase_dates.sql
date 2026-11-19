-- Spec 031: real dependencies between milestones, and dates on phases.
--
-- A milestone may wait for one or more others, of the same site or of another one (« the slab of
-- the first floor waits for the foundations », « the handover waits for the client's payment »).
-- `lag_days` is the minimum gap after the predecessor. Cycles are refused by the domain.
create table milestone_dependency (
  org_id text not null references organization(id) on delete cascade,
  milestone_id uuid not null,
  depends_on_id uuid not null,
  lag_days integer not null default 0 check (lag_days between 0 and 365),
  created_at timestamptz not null default now(),
  primary key (milestone_id, depends_on_id),
  check (milestone_id <> depends_on_id),
  foreign key (milestone_id, org_id) references milestone (id, org_id) on delete cascade,
  foreign key (depends_on_id, org_id) references milestone (id, org_id) on delete cascade
);
create index milestone_dependency_pred_idx on milestone_dependency (depends_on_id);

alter table milestone_dependency enable row level security;
create policy milestone_dependency_member on milestone_dependency
  using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- A phase's planned window, drawn as a bar under its site in the Gantt.
alter table project_phase
  add column start_date date,
  add column end_date date,
  add constraint project_phase_dates check (start_date is null or end_date is null or end_date >= start_date);
