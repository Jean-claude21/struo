-- Spec 051: the client's application.
-- What is new since the client's last visit, their e-mail preference, whether raw field reports are
-- shown, payments the client declares (the company confirms them), and phone notifications
-- (Web Push) for the client and the team.

alter table portal_link
  add column last_visit_at timestamptz,
  add column seen_before_at timestamptz,
  add column email_opt_out boolean not null default false,
  add column show_field_reports boolean not null default false;

-- The company lets its clients declare a payment (« I paid »), with a proof, to confirm.
alter table invoice_settings add column client_can_declare boolean not null default true;

create table payment_claim (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  invoice_id uuid not null,
  portal_link_id uuid references portal_link(id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  paid_on date not null,
  method text not null check (method in ('mobile_money', 'transfer', 'cheque', 'cash', 'card', 'other')),
  reference text check (length(reference) <= 120),
  note text check (length(note) <= 1000),
  proof_key text,
  proof_media_type text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reject_reason text check (length(reject_reason) <= 500),
  payment_id uuid,
  decided_by text references "user"(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index payment_claim_org_idx on payment_claim (org_id, status, created_at desc);
create index payment_claim_invoice_idx on payment_claim (invoice_id);
alter table payment_claim enable row level security;
create policy payment_claim_member on payment_claim using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- A phone (or browser) that accepted notifications: a team member's, or a client link's.
create table push_subscription (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  user_id text references "user"(id) on delete cascade,
  portal_link_id uuid references portal_link(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check ((user_id is null) <> (portal_link_id is null))
);
create index push_subscription_user_idx on push_subscription (org_id, user_id);
create index push_subscription_link_idx on push_subscription (portal_link_id);
alter table push_subscription enable row level security;
create policy push_subscription_member on push_subscription using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- The client's photos carry their stage, to be arranged by stage in the space.
create or replace function struo_portal_view(hash text) returns jsonb
  language plpgsql stable security definer set search_path = public
  as $$
declare l record; result jsonb;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then return null; end if;
  select jsonb_build_object(
    'company', jsonb_build_object('name', o.name, 'logo', o.logo, 'brandColor', s.brand_color,
                                  'locale', s.locale),
    'project', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status,
                                  'location', p.location, 'startDate', p.start_date, 'endDate', p.end_date,
                                  'progress', pp.progress_pct, 'currency', p.currency_code,
                                  'client', c.name, 'clientEmail', c.email),
    'phases', coalesce((select jsonb_agg(jsonb_build_object('name', ph.name, 'progress', ph.progress_pct)
                                         order by ph.position)
                          from project_phase ph where ph.project_id = p.id), '[]'),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', m.id, 'name', m.name, 'plannedOn', m.planned_on, 'actualOn', m.actual_on,
                              'clientValidation', m.client_validation, 'validatedAt', m.client_validated_at)
                            order by m.planned_on)
                            from milestone m where m.project_id = p.id), '[]'),
    'photos', coalesce((select jsonb_agg(x) from (
                          select jsonb_build_object('id', ph.id, 'takenAt', ph.taken_at, 'note', r.note, 'phase', st.name) as x
                            from report_photo ph join site_report r on r.id = ph.report_id
                            left join project_phase st on st.id = r.phase_id
                           where r.project_id = p.id and ph.shared_with_client and r.status = 'validated'
                           order by ph.taken_at desc limit 60) q), '[]'),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title,
                                                               'hasFile', d.storage_key is not null))
                             from project_document d
                            where d.project_id = p.id and d.shared_with_client), '[]'),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', b.invoice_id, 'number', b.number, 'kind', b.kind, 'issuedOn', b.issued_on,
                            'dueOn', b.due_on, 'net', b.net_minor, 'paid', b.paid_minor,
                            'balance', b.balance_minor, 'currency', b.currency_code) order by b.issued_on)
                            from invoice_balance b where b.project_id = p.id), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('authorKind', g.author_kind,
                                                              'authorName', g.author_name, 'body', g.body,
                                                              'at', g.created_at) order by g.created_at)
                            from (select * from message where project_id = p.id
                                   order by created_at desc limit 100) g), '[]')
  ) into result
  from project p
  join organization o on o.id = p.org_id
  join org_settings s on s.org_id = p.org_id
  join project_progress pp on pp.project_id = p.id
  left join client c on c.id = p.client_id
  where p.id = l.project_id;
  return result;
end $$;
