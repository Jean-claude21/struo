-- Spec 048: link what exists, so the system works as one.
-- A task may aim at a milestone or a phase, and may be the action that clears an incident.
-- A document belongs to a family (administrative, technical, other); the field sees the technical ones.
-- A checklist is daily, tied to a phase, or on demand. A change order (avenant) is extra work with a
-- price, accepted by the client, then invoiced.

alter table incident add unique (id, org_id);
alter table project_task add column milestone_id uuid;
alter table project_task add column phase_id uuid;
alter table project_task add column incident_id uuid;
alter table project_task add foreign key (milestone_id, org_id) references milestone (id, org_id) on delete set null (milestone_id);
alter table project_task add foreign key (phase_id, org_id) references project_phase (id, org_id) on delete set null (phase_id);
alter table project_task add foreign key (incident_id, org_id) references incident (id, org_id) on delete set null (incident_id);
create unique index project_task_incident_idx on project_task (incident_id) where incident_id is not null;

alter table project_document add column family text not null default 'other' check (family in ('admin', 'technical', 'other'));
-- Existing documents: required types are administrative, drawings and studies are technical.
update project_document d set family = 'admin'
  from doc_type t where t.id = d.doc_type_id and t.required;
update project_document set family = 'technical'
 where family = 'other' and (title ~* '(plan|coupe|fa[cç]ade|[ée]tude|note de calcul|ferraill|drawing|section)');

alter table checklist_template add column mode text not null default 'daily' check (mode in ('daily', 'phase', 'on_demand'));
alter table checklist_template add column phase_name text check (length(phase_name) <= 120);
-- « Before pouring concrete » belongs to the structural work, not to every day.
update checklist_template set mode = 'phase', phase_name = 'Gros œuvre' where name = 'Avant coulage béton';
update checklist_template set mode = 'phase', phase_name = 'Structural work' where name = 'Before pouring concrete';
update checklist_template set mode = 'on_demand' where name in ('Réception de matériaux', 'Receiving materials');

create table change_order (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  project_id uuid not null,
  number integer not null,
  title text not null check (length(title) between 1 and 200),
  description text check (length(description) <= 4000),
  amount_minor bigint not null check (amount_minor > 0),
  days_added integer not null default 0 check (days_added between 0 and 3650),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'refused')),
  sent_at timestamptz,
  decided_at timestamptz,
  decided_by text check (length(decided_by) <= 120),
  invoice_id uuid,
  created_by text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, number),
  unique (id, org_id),
  foreign key (project_id, org_id) references project (id, org_id) on delete cascade
);
create index change_order_project_idx on change_order (project_id, number);
alter table change_order enable row level security;
create policy change_order_member on change_order using (struo_is_member(org_id)) with check (struo_is_member(org_id));

-- The client sees the change orders sent to them and accepts or refuses them from the portal.
create function struo_portal_change_orders(hash text) returns jsonb
  language sql stable security definer set search_path = public
  as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'number', c.number, 'title', c.title, 'description', c.description,
           'amountMinor', c.amount_minor, 'daysAdded', c.days_added, 'status', c.status,
           'decidedAt', c.decided_at, 'decidedBy', c.decided_by) order by c.number), '[]'::jsonb)
    from portal_link l join change_order c on c.project_id = l.project_id
   where l.token_hash = hash and l.revoked_at is null and c.status <> 'draft'
  $$;

create function struo_portal_decide_change_order(hash text, target uuid, accept boolean, signer text) returns boolean
  language plpgsql security definer set search_path = public
  as $$
declare l record; done boolean;
begin
  select * into l from portal_link where token_hash = hash and revoked_at is null;
  if not found then raise exception 'portal_link_invalid'; end if;
  update change_order set status = case when accept then 'accepted' else 'refused' end,
         decided_at = now(), decided_by = left(signer, 120)
   where id = target and project_id = l.project_id and status = 'sent'
  returning true into done;
  if done then
    insert into journal (org_id, command, target, after, actor, door)
    values (l.org_id, case when accept then 'change_order.accept' else 'change_order.refuse' end, target::text,
            jsonb_build_object('signer', signer), 'portal:' || l.id, 'portal');
  end if;
  return coalesce(done, false);
end $$;

revoke execute on function struo_portal_change_orders(text), struo_portal_decide_change_order(text, uuid, boolean, text) from public;
grant execute on function struo_portal_change_orders(text), struo_portal_decide_change_order(text, uuid, boolean, text) to struo_app;

-- New companies get the same sensible defaults: the concrete checklist during the structural work,
-- materials on demand, end of day and safety every day.
create or replace function struo_seed_checklists(target_org text, lang text) returns void
  language plpgsql
  as $$
begin
  if exists (select 1 from checklist_template where org_id = target_org) then return; end if;
  if lang = 'en' then
    insert into checklist_template (org_id, name, items, position, mode, phase_name, required) values
      (target_org, 'Before pouring concrete', '["Formwork clean and oiled", "Rebar as per the latest drawing", "Concrete cover checked", "Mixer and vibrator ready", "Weather allows pouring"]', 1, 'phase', 'Structural work', true),
      (target_org, 'Receiving materials', '["Quantity matches the delivery note", "Quality checked (bags intact, no rust)", "Stored dry and off the ground", "Delivery note signed"]', 2, 'on_demand', null, false),
      (target_org, 'End of day', '["Site cleaned", "Tools stored and locked", "Fresh concrete covered", "Gate locked"]', 3, 'daily', null, true),
      (target_org, 'Safety', '["Helmets and vests worn", "Scaffolding checked", "First-aid kit available", "Openings protected"]', 4, 'daily', null, true);
  else
    insert into checklist_template (org_id, name, items, position, mode, phase_name, required) values
      (target_org, 'Avant coulage béton', '["Coffrages propres et huilés", "Ferraillage conforme au dernier plan", "Enrobage vérifié", "Bétonnière et vibreur prêts", "Météo favorable au coulage"]', 1, 'phase', 'Gros œuvre', true),
      (target_org, 'Réception de matériaux', '["Quantité conforme au bon de livraison", "Qualité vérifiée (sacs intacts, pas de rouille)", "Stockage au sec et hors sol", "Bon de livraison signé"]', 2, 'on_demand', null, false),
      (target_org, 'Fin de journée', '["Chantier nettoyé", "Outillage rangé et fermé", "Béton frais protégé", "Portail fermé à clé"]', 3, 'daily', null, true),
      (target_org, 'Sécurité', '["Casques et gilets portés", "Échafaudages vérifiés", "Trousse de secours disponible", "Trémies protégées"]', 4, 'daily', null, true);
  end if;
end $$;
update checklist_template set required = false where mode = 'on_demand';
