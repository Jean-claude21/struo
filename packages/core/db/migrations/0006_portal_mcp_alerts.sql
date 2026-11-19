-- Reporting and alerts (spec 009), client portal (spec 010), MCP keys (spec 011), notifications.

-- ---------------------------------------------------------------- financial view of a project
create view project_finance with (security_invoker = true) as
select p.id as project_id,
       p.org_id,
       p.currency_code,
       p.budget_minor,
       pp.progress_pct,
       coalesce(inv.invoiced_minor, 0)::bigint as invoiced_minor,
       coalesce(inv.net_minor, 0)::bigint as invoiced_net_minor,
       coalesce(inv.retention_minor, 0)::bigint as retention_minor,
       coalesce(pay.collected_minor, 0)::bigint as collected_minor,
       coalesce(exp.spent_minor, 0)::bigint as spent_minor,
       coalesce(bal.overdue_minor, 0)::bigint as overdue_minor,
       coalesce(bal.max_overdue_days, 0) as max_overdue_days,
       (coalesce(pay.collected_minor, 0) - coalesce(exp.spent_minor, 0))::bigint as cash_minor,
       case when p.budget_minor > 0
            then round(coalesce(pay.collected_minor, 0)::numeric * 100 / p.budget_minor)::integer
            else 0 end as collected_pct,
       case when p.budget_minor > 0
            then round(coalesce(inv.invoiced_minor, 0)::numeric * 100 / p.budget_minor)::integer
            else 0 end as invoiced_pct,
       -- Health: critical when a balance is overdue by more than 30 days or the project is suspended
       -- with money owed; weak when collection lags progress by more than the company's threshold.
       case
         when coalesce(bal.max_overdue_days, 0) > 30 then 'critical'
         when p.status = 'suspended' and coalesce(bal.balance_minor, 0) > 0 then 'critical'
         when p.budget_minor > 0
              and pp.progress_pct - round(coalesce(pay.collected_minor, 0)::numeric * 100 / p.budget_minor)
                  > coalesce(s.alert_gap_points, 10) then 'weak'
         else 'healthy' end as health
from project p
join project_progress pp on pp.project_id = p.id
left join org_settings s on s.org_id = p.org_id
left join (select project_id, sum(total_minor) as invoiced_minor, sum(net_minor) as net_minor,
                  sum(retention_minor) as retention_minor
             from invoice where status = 'issued' group by project_id) inv on inv.project_id = p.id
left join (select project_id, sum(amount_minor) as collected_minor from payment group by project_id) pay
  on pay.project_id = p.id
left join (select project_id, sum(amount_minor) as spent_minor from expense group by project_id) exp
  on exp.project_id = p.id
left join (select project_id, sum(balance_minor) as balance_minor,
                  sum(balance_minor) filter (where overdue_days > 0) as overdue_minor,
                  max(overdue_days) as max_overdue_days
             from invoice_balance group by project_id) bal on bal.project_id = p.id;

-- ---------------------------------------------------------------- alerts
-- Every alert the company should see today, computed from its own rows (RLS applies: invoker).
-- `kind` is an i18n key; `params` fills it. Severity: critical · important · info.
create function struo_alerts(target_org text)
  returns table (kind text, severity text, project_id uuid, target text, params jsonb, sort_key integer)
  language sql stable
  as $$
  with s as (select * from org_settings where org_id = target_org)
  -- Overdue invoices.
  select 'invoice_overdue', case when b.overdue_days > 30 then 'critical' else 'important' end,
         b.project_id, b.invoice_id::text,
         jsonb_build_object('number', b.number, 'project', p.name, 'days', b.overdue_days,
                            'amount', b.balance_minor, 'currency', b.currency_code),
         b.overdue_days
    from invoice_balance b join project p on p.id = b.project_id
   where b.org_id = target_org and b.overdue_days > 0
  union all
  -- Documents expired, or expiring within the largest threshold.
  select case when d.expires_on < current_date then 'document_expired' else 'document_expiring' end,
         case when d.expires_on < current_date then 'critical'
              when d.expires_on - current_date <= 7 then 'important' else 'info' end,
         d.project_id, d.id::text,
         jsonb_build_object('title', d.title, 'project', p.name, 'days', d.expires_on - current_date,
                            'date', d.expires_on),
         1000 - (d.expires_on - current_date)
    from project_document d join project p on p.id = d.project_id, s
   where d.org_id = target_org and d.expires_on is not null and p.status <> 'done'
     and d.expires_on - current_date <= (select max(x) from unnest(s.alert_doc_days) x)
  union all
  -- Required documents missing or to regularize.
  select 'document_to_fix', 'important', d.project_id, d.id::text,
         jsonb_build_object('title', d.title, 'project', p.name, 'status', d.status), 50
    from project_document d join project p on p.id = d.project_id
    join doc_type t on t.id = d.doc_type_id
   where d.org_id = target_org and t.required and d.status in ('missing', 'to_fix')
     and p.status in ('active', 'pending')
  union all
  -- Late milestones (beyond the company's threshold).
  select 'milestone_late', case when ms.delay_days > 30 then 'critical' else 'important' end,
         m.project_id, m.id::text,
         jsonb_build_object('name', m.name, 'project', p.name, 'days', ms.delay_days), ms.delay_days
    from milestone m join milestone_status ms on ms.milestone_id = m.id
    join project p on p.id = m.project_id, s
   where m.org_id = target_org and ms.status = 'late' and ms.delay_days > s.alert_late_days
  union all
  -- Collection lagging behind progress.
  select 'collection_gap', 'important', f.project_id, f.project_id::text,
         jsonb_build_object('project', p.name, 'progress', f.progress_pct, 'collected', f.collected_pct),
         f.progress_pct - f.collected_pct
    from project_finance f join project p on p.id = f.project_id, s
   where f.org_id = target_org and p.status = 'active' and f.budget_minor > 0
     and f.progress_pct - f.collected_pct > s.alert_gap_points
  union all
  -- Open incidents.
  select 'incident_open', i.priority, i.project_id, i.id::text,
         jsonb_build_object('kind', i.kind, 'project', p.name, 'description', left(i.description, 120)),
         case i.priority when 'critical' then 500 when 'important' then 100 else 1 end
    from incident i join project p on p.id = i.project_id
   where i.org_id = target_org and i.status = 'open' and i.priority in ('critical', 'important')
  union all
  -- Reports waiting for validation.
  select 'reports_to_review', 'info', null, target_org,
         jsonb_build_object('count', count(*)), 0
    from site_report r where r.org_id = target_org and r.status = 'submitted'
   having count(*) > 0
  $$;

-- What was already notified, so a digest or a reminder is never sent twice the same day.
create table notification_log (
  id bigint generated always as identity primary key,
  org_id text not null references organization(id) on delete cascade,
  kind text not null,
  target text not null,
  channel text not null,
  day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (org_id, kind, target, channel, day)
);
alter table notification_log enable row level security;
create policy notification_log_member on notification_log
  using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- ---------------------------------------------------------------- client portal
create table portal_link (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  token_hash text not null unique,
  label text,
  created_by text references "user"(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);

create table message (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  author_kind text not null check (author_kind in ('team', 'client')),
  author_id text,
  author_name text not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index message_project_idx on message (project_id, created_at);

-- ---------------------------------------------------------------- MCP / API keys
create table api_key (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  -- The key acts as this member, with their role.
  user_id text not null references "user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['portal_link', 'message', 'api_key'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (struo_is_member(org_id)) with check (struo_is_member(org_id))',
      t || '_member', t);
  end loop;
end $$;

-- Who a key acts for: the only read of api_key that does not need a user context.
create function struo_api_key_owner(hash text)
  returns table (org_id text, user_id text, key_id uuid)
  language sql security definer set search_path = public
  as $$
  update api_key set last_used_at = now()
   where key_hash = hash and revoked_at is null
     and exists (select 1 from member m where m."organizationId" = api_key.org_id and m."userId" = api_key.user_id)
  returning org_id, user_id, id
  $$;

-- The portal: a client reaches one project through a hashed token, never through a policy.
create function struo_portal_link(hash text)
  returns table (link_id uuid, org_id text, project_id uuid)
  language sql security definer set search_path = public
  as $$
  update portal_link set last_seen_at = now()
   where token_hash = hash and revoked_at is null
  returning id, org_id, project_id
  $$;

create function struo_portal_view(hash text) returns jsonb
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
                          select jsonb_build_object('id', ph.id, 'takenAt', ph.taken_at, 'note', r.note) as x
                            from report_photo ph join site_report r on r.id = ph.report_id
                           where r.project_id = p.id and ph.shared_with_client and r.status <> 'rejected'
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
                                   order by created_at desc limit 100) g), '[]'),
    'canPay', exists (select 1 from org_payment_provider op where op.org_id = p.org_id and op.enabled)
  ) into result
  from project p
  join organization o on o.id = p.org_id
  join org_settings s on s.org_id = p.org_id
  join project_progress pp on pp.project_id = p.id
  left join client c on c.id = p.client_id
  where p.id = l.project_id;
  return result;
end $$;

create function struo_portal_post_message(hash text, body text) returns uuid
  language plpgsql security definer set search_path = public
  as $$
declare l record; c_name text; new_id uuid;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  select coalesce(c.name, 'Client') into c_name
    from project p left join client c on c.id = p.client_id where p.id = l.project_id;
  insert into message (org_id, project_id, author_kind, author_name, body)
  values (l.org_id, l.project_id, 'client', coalesce(c_name, 'Client'), body)
  returning id into new_id;
  insert into journal (org_id, command, target, after, actor, door)
  values (l.org_id, 'message.post', new_id::text, jsonb_build_object('body', body), 'portal:' || l.id, 'portal');
  return new_id;
end $$;

create function struo_portal_validate_milestone(hash text, target_milestone uuid, signer text) returns boolean
  language plpgsql security definer set search_path = public
  as $$
declare l record; done boolean;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  update milestone set client_validated_at = now(), client_validated_by = left(signer, 120)
   where id = target_milestone and project_id = l.project_id and client_validation
     and client_validated_at is null
  returning true into done;
  if done then
    insert into journal (org_id, command, target, after, actor, door)
    values (l.org_id, 'milestone.client_validate', target_milestone::text,
            jsonb_build_object('signer', signer), 'portal:' || l.id, 'portal');
  end if;
  return coalesce(done, false);
end $$;

-- A file the portal may download: a shared photo or a shared document of the link's project.
create function struo_portal_file(hash text, file_id uuid)
  returns table (storage_key text, media_type text)
  language sql stable security definer set search_path = public
  as $$
  select ph.storage_key, ph.media_type
    from portal_link l join site_report r on r.project_id = l.project_id
    join report_photo ph on ph.report_id = r.id
   where l.token_hash = hash and l.revoked_at is null and ph.id = file_id and ph.shared_with_client
  union all
  select d.storage_key, d.media_type
    from portal_link l join project_document d on d.project_id = l.project_id
   where l.token_hash = hash and l.revoked_at is null and d.id = file_id and d.shared_with_client
     and d.storage_key is not null
  $$;

-- Functions reached without a user context are not callable by anyone but the application.
revoke execute on function struo_api_key_owner(text), struo_portal_link(text), struo_portal_view(text),
  struo_portal_post_message(text, text), struo_portal_validate_milestone(text, uuid, text),
  struo_portal_file(text, uuid) from public;
grant execute on function struo_api_key_owner(text), struo_portal_link(text), struo_portal_view(text),
  struo_portal_post_message(text, text), struo_portal_validate_milestone(text, uuid, text),
  struo_portal_file(text, uuid) to struo_app;

-- ---------------------------------------------------------------- default configuration
-- Seeds a new company with its trade configuration, in its language. Called once at creation.
create function struo_seed_org_defaults(target_org text, lang text) returns void
  language plpgsql
  as $$
begin
  if lang = 'en' then
    insert into project_type (org_id, name, position) values
      (target_org, 'Residential', 1), (target_org, 'Commercial', 2),
      (target_org, 'Institutional', 3), (target_org, 'Renovation', 4) on conflict do nothing;
    insert into phase_template (org_id, name, position) values
      (target_org, 'Studies', 1), (target_org, 'Foundations', 2), (target_org, 'Structural work', 3),
      (target_org, 'Roofing', 4), (target_org, 'Finishing work', 5) on conflict do nothing;
    insert into doc_type (org_id, name, required, has_expiry, position) values
      (target_org, 'Contract', true, false, 1), (target_org, 'Service order', true, false, 2),
      (target_org, 'Building permit', true, true, 3), (target_org, 'Liability insurance', true, true, 4)
      on conflict do nothing;
  else
    insert into project_type (org_id, name, position) values
      (target_org, 'Résidentiel', 1), (target_org, 'Commercial', 2),
      (target_org, 'Institutionnel', 3), (target_org, 'Rénovation', 4) on conflict do nothing;
    insert into phase_template (org_id, name, position) values
      (target_org, 'Études', 1), (target_org, 'Fondations', 2), (target_org, 'Gros œuvre', 3),
      (target_org, 'Couverture', 4), (target_org, 'Second œuvre', 5) on conflict do nothing;
    insert into doc_type (org_id, name, required, has_expiry, position) values
      (target_org, 'Contrat', true, false, 1), (target_org, 'Ordre de service', true, false, 2),
      (target_org, 'Permis de construire', true, true, 3), (target_org, 'Assurance RC', true, true, 4)
      on conflict do nothing;
  end if;
end $$;
