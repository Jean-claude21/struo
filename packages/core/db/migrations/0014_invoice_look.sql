-- Spec 036: how a company's invoices look, set by the company and previewed live.
alter table invoice_settings
  add column logo_key text check (length(logo_key) <= 300),
  add column template text not null default 'classic' check (template in ('classic', 'modern', 'compact')),
  add column accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add column logo_position text not null default 'left' check (logo_position in ('left', 'center', 'right')),
  add column logo_height integer not null default 56 check (logo_height between 24 and 160),
  add column font text not null default 'sans' check (font in ('sans', 'serif')),
  add column show_amount_words boolean not null default true,
  add column show_signature boolean not null default false,
  add column signer_name text check (length(signer_name) <= 120),
  add column signer_title text check (length(signer_title) <= 120),
  add column show_client_contact boolean not null default true,
  add column show_site boolean not null default true,
  add column show_payments boolean not null default true,
  add column show_unit_columns boolean not null default true,
  -- Titles per kind ({ "advance": "Facture d'acompte", … }); empty keeps Struo's words.
  add column titles jsonb not null default '{}'::jsonb,
  -- The company's own fields printed in the header ([{ "label": "Agrément", "value": "BTP-B2" }]).
  add column custom_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_fields) = 'array');

-- An invoice's own free fields ([{ "label": "Délai", "value": "6 mois" }]), printed with its references.
alter table invoice add column extra_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(extra_fields) = 'array');

-- The logo is public (it is printed on invoices and shown in client spaces): read past row security.
create function struo_org_logo(target text) returns text
  language sql stable security definer set search_path = public
  as $$ select logo_key from invoice_settings where org_id = target $$;
revoke all on function struo_org_logo(text) from public;
grant execute on function struo_org_logo(text) to struo_app;
