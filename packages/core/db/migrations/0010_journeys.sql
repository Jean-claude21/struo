-- Journeys (specs 022-026): incidents followed to their resolution, field checklists, signatures,
-- delivery notes read by OCR, and a client portal opened by e-mail code on a trusted device, with
-- what the client sees chosen per link.

-- ---------------------------------------------------------------- incidents: open → in progress → resolved
alter table incident drop constraint incident_status_check;
alter table incident add constraint incident_status_check check (status in ('open', 'in_progress', 'resolved'));
alter table incident
  add column decision text check (decision is null or length(decision) <= 200),
  add column action text check (action is null or length(action) <= 1000),
  add column assignee_id text references "user"(id) on delete set null,
  add column due_on date,
  add column impact_days integer check (impact_days is null or impact_days between 0 and 365),
  add column resolution_note text check (resolution_note is null or length(resolution_note) <= 2000);

-- ---------------------------------------------------------------- checklists
create table checklist_template (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 40),
  required boolean not null default true,
  position integer not null default 0,
  archived_at timestamptz,
  unique (id, org_id)
);

-- A checklist done on a site. Its id is chosen on the device (idempotent offline sync).
create table checklist_run (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  template_id uuid,
  name text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  done_count integer not null default 0,
  total_count integer not null default 0,
  completed boolean not null default false,
  author_id text not null references "user"(id),
  done_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade,
  foreign key (template_id, org_id) references checklist_template (id, org_id) on delete set null (template_id)
);
create index checklist_run_project_idx on checklist_run (project_id, done_at desc);

-- ---------------------------------------------------------------- signatures (PV, deliveries, milestones)
create table signature (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  subject_kind text not null check (subject_kind in ('delivery', 'milestone', 'pv', 'checklist')),
  subject_id uuid,
  title text not null check (length(title) between 1 and 200),
  signer_name text not null check (length(signer_name) between 2 and 120),
  signer_role text check (signer_role is null or length(signer_role) <= 80),
  verdict text not null default 'conform' check (verdict in ('conform', 'reserve')),
  reserve_note text check (reserve_note is null or length(reserve_note) <= 2000),
  image_key text not null,
  via text not null check (via in ('field', 'office', 'portal')),
  author_id text references "user"(id),
  signed_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index signature_project_idx on signature (project_id, signed_at desc);

-- ---------------------------------------------------------------- delivery notes (scanned on site)
create table delivery (
  id uuid primary key,
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  supplier text check (supplier is null or length(supplier) <= 200),
  item text not null check (length(item) between 1 and 300),
  quantity numeric(14, 3),
  unit text check (unit is null or length(unit) <= 20),
  delivered_on date not null,
  reference text check (reference is null or length(reference) <= 120),
  photo_key text,
  extracted jsonb,
  verdict text not null default 'conform' check (verdict in ('conform', 'reserve')),
  note text check (note is null or length(note) <= 2000),
  author_id text not null references "user"(id),
  created_at timestamptz not null default now(),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index delivery_project_idx on delivery (project_id, delivered_on desc);

do $$
declare t text;
begin
  foreach t in array array['checklist_template', 'checklist_run', 'signature', 'delivery'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I using (struo_is_member(org_id)) with check (struo_is_member(org_id))', t || '_member', t);
  end loop;
end $$;

-- Default checklists for every company that has none (new companies get them at creation).
create function struo_seed_checklists(target_org text, lang text) returns void
  language plpgsql
  as $$
begin
  if exists (select 1 from checklist_template where org_id = target_org) then return; end if;
  if lang = 'en' then
    insert into checklist_template (org_id, name, items, position) values
      (target_org, 'Before pouring concrete', '["Formwork clean and oiled", "Rebar as per the latest drawing", "Concrete cover checked", "Mixer and vibrator ready", "Weather allows pouring"]', 1),
      (target_org, 'Receiving materials', '["Quantity matches the delivery note", "Quality checked (bags intact, no rust)", "Stored dry and off the ground", "Delivery note signed"]', 2),
      (target_org, 'End of day', '["Site cleaned", "Tools stored and locked", "Fresh concrete covered", "Gate locked"]', 3),
      (target_org, 'Safety', '["Helmets and vests worn", "Scaffolding checked", "First-aid kit available", "Openings protected"]', 4);
  else
    insert into checklist_template (org_id, name, items, position) values
      (target_org, 'Avant coulage béton', '["Coffrages propres et huilés", "Ferraillage conforme au dernier plan", "Enrobage vérifié", "Bétonnière et vibreur prêts", "Météo favorable au coulage"]', 1),
      (target_org, 'Réception de matériaux', '["Quantité conforme au bon de livraison", "Qualité vérifiée (sacs intacts, pas de rouille)", "Stockage au sec et hors sol", "Bon de livraison signé"]', 2),
      (target_org, 'Fin de journée', '["Chantier nettoyé", "Outillage rangé et fermé", "Béton frais protégé", "Portail fermé à clé"]', 3),
      (target_org, 'Sécurité', '["Casques et gilets portés", "Échafaudages vérifiés", "Trousse de secours disponible", "Trémies protégées"]', 4);
  end if;
end $$;
select struo_seed_checklists(s.org_id, s.locale) from org_settings s;

-- ---------------------------------------------------------------- client portal: what the client sees, and who
alter table portal_link
  add column contact_name text check (contact_name is null or length(contact_name) <= 120),
  add column contact_email text check (contact_email is null or length(contact_email) <= 254),
  add column contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  add column require_code boolean not null default true,
  add column show_photos boolean not null default true,
  add column show_planning boolean not null default true,
  add column show_finance boolean not null default true,
  add column show_documents boolean not null default true,
  add column show_messages boolean not null default true,
  add column invited_at timestamptz,
  add column first_opened_at timestamptz;

-- One-time codes sent by e-mail; only their hash is kept.
create table portal_code (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references portal_link(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index portal_code_link_idx on portal_code (link_id, created_at desc);

-- A device the client confirmed once (its token lives in an httpOnly cookie, only its hash here).
create table portal_device (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references portal_link(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- Reached only through the security-definer functions below (no company member reads them).
alter table portal_code enable row level security;
alter table portal_device enable row level security;
revoke all on portal_code, portal_device from struo_app;

create function struo_portal_access(hash text, device_hash text)
  returns table (link_id uuid, org_id text, project_id uuid, require_code boolean, verified boolean,
                 contact_email text, contact_name text, show_photos boolean, show_planning boolean,
                 show_finance boolean, show_documents boolean, show_messages boolean)
  language sql stable security definer set search_path = public
  as $$
  select l.id, l.org_id, l.project_id, l.require_code,
         (not l.require_code) or exists (select 1 from portal_device d where d.link_id = l.id and d.token_hash = device_hash and d.revoked_at is null),
         coalesce(l.contact_email, c.email), coalesce(l.contact_name, c.name),
         l.show_photos, l.show_planning, l.show_finance, l.show_documents, l.show_messages
    from portal_link l join project p on p.id = l.project_id left join client c on c.id = p.client_id
   where l.token_hash = hash and l.revoked_at is null
  $$;

create function struo_portal_issue_code(hash text, new_code_hash text) returns text
  language plpgsql security definer set search_path = public
  as $$
declare l record; recent integer; email text;
begin
  select pl.*, coalesce(pl.contact_email, c.email) as mail into l
    from portal_link pl join project p on p.id = pl.project_id left join client c on c.id = p.client_id
   where pl.token_hash = hash and pl.revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  if l.mail is null then raise exception 'portal_no_email'; end if;
  select count(*) into recent from portal_code where link_id = l.id and created_at > now() - interval '15 minutes';
  if recent >= 5 then raise exception 'portal_too_many_codes'; end if;
  insert into portal_code (link_id, code_hash, expires_at) values (l.id, new_code_hash, now() + interval '15 minutes');
  return l.mail;
end $$;

create function struo_portal_verify_code(hash text, try_code_hash text, new_device_hash text) returns boolean
  language plpgsql security definer set search_path = public
  as $$
declare l record; c record;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  select * into c from portal_code where link_id = l.id and used_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then return false; end if;
  if c.attempts >= 5 then return false; end if;
  if c.code_hash <> try_code_hash then
    update portal_code set attempts = attempts + 1 where id = c.id;
    return false;
  end if;
  update portal_code set used_at = now() where id = c.id;
  insert into portal_device (link_id, token_hash) values (l.id, new_device_hash);
  update portal_link set first_opened_at = coalesce(first_opened_at, now()) where id = l.id;
  insert into journal (org_id, command, target, after, actor, door)
  values (l.org_id, 'portal.device_verified', l.id::text, null, 'portal:' || l.id, 'portal');
  return true;
end $$;

-- The client signs a milestone (or a PV) with their finger: the signature image is stored first,
-- then recorded here with the validation.
create function struo_portal_sign_milestone(hash text, target_milestone uuid, signer text, sig_id uuid, sig_key text,
                                            verdict_in text, reserve text) returns boolean
  language plpgsql security definer set search_path = public
  as $$
declare l record; m record;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  select * into m from milestone where id = target_milestone and project_id = l.project_id and client_validation for update;
  if not found or m.client_validated_at is not null then return false; end if;
  insert into signature (id, org_id, project_id, subject_kind, subject_id, title, signer_name, signer_role, verdict, reserve_note, image_key, via)
  values (sig_id, l.org_id, l.project_id, 'milestone', m.id, m.name, left(signer, 120), 'client',
          case when verdict_in = 'reserve' then 'reserve' else 'conform' end, left(reserve, 2000), sig_key, 'portal');
  update milestone set client_validated_at = now(), client_validated_by = left(signer, 120) where id = m.id;
  insert into journal (org_id, command, target, after, actor, door)
  values (l.org_id, 'milestone.client_sign', m.id::text, jsonb_build_object('signer', signer, 'verdict', verdict_in, 'reserve', reserve),
          'portal:' || l.id, 'portal');
  return true;
end $$;

-- Validated field reports of the link's project, written for the client (notes and photo ids).
create function struo_portal_reports(hash text) returns jsonb
  language sql stable security definer set search_path = public
  as $$
  select coalesce(jsonb_agg(x order by (x->>'takenAt') desc), '[]')
    from (select jsonb_build_object('id', r.id, 'takenAt', r.taken_at, 'note', coalesce(r.note, r.transcript),
                                    'phase', ph.name, 'progress', r.progress_pct, 'author', split_part(u.name, ' ', 1),
                                    'photos', coalesce((select jsonb_agg(f.id order by f.taken_at) from report_photo f
                                                         where f.report_id = r.id and f.shared_with_client), '[]')) as x
            from portal_link l join site_report r on r.project_id = l.project_id
            join "user" u on u.id = r.author_id left join project_phase ph on ph.id = r.phase_id
           where l.token_hash = hash and l.revoked_at is null and r.status = 'validated'
           order by r.taken_at desc limit 30) q
  $$;

revoke execute on function struo_portal_access(text, text), struo_portal_issue_code(text, text),
  struo_portal_verify_code(text, text, text), struo_portal_sign_milestone(text, uuid, text, uuid, text, text, text),
  struo_portal_reports(text) from public;
grant execute on function struo_portal_access(text, text), struo_portal_issue_code(text, text),
  struo_portal_verify_code(text, text, text), struo_portal_sign_milestone(text, uuid, text, uuid, text, text, text),
  struo_portal_reports(text) to struo_app;
