-- Spec 050 (step 0): what reaches the client is only what the company validated.
-- 1. The client's space shows the photos of validated field reports only (pending ones are not seen
--    by the office yet), and the online payment flag is gone (companies collect payment their own way).
-- 2. A document family for contracts and signed quotes.

alter table project_document drop constraint if exists project_document_family_check;
alter table project_document add constraint project_document_family_check
  check (family in ('admin', 'technical', 'contract', 'other'));

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
                          select jsonb_build_object('id', ph.id, 'takenAt', ph.taken_at, 'note', r.note) as x
                            from report_photo ph join site_report r on r.id = ph.report_id
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

create or replace function struo_portal_file(hash text, file_id uuid)
  returns table (storage_key text, media_type text)
  language sql stable security definer set search_path = public
  as $$
  select ph.storage_key, ph.media_type
    from portal_link l join site_report r on r.project_id = l.project_id
    join report_photo ph on ph.report_id = r.id
   where l.token_hash = hash and l.revoked_at is null and ph.id = file_id and ph.shared_with_client
     and r.status = 'validated'
  union all
  select d.storage_key, d.media_type
    from portal_link l join project_document d on d.project_id = l.project_id
   where l.token_hash = hash and l.revoked_at is null and d.id = file_id and d.shared_with_client
     and d.storage_key is not null
  $$;
