-- Spec 042: try Struo without an account. A few copies of the demo company are prepared in advance;
-- a visitor receives one for 24 hours, alone, then it is deleted with its accounts.
-- Platform table: read and written only by the platform's own connection (row security on, no policy
-- for the application role); companies never see it.
create table demo_sandbox (
  org_id text primary key references organization(id) on delete cascade,
  -- The accounts of the copy by role (owner, engineer, site_lead, accountant) and the password,
  -- encrypted with the application's secret key.
  accounts jsonb not null,
  password_enc text not null,
  -- The client space that opens without a code.
  portal_token text,
  status text not null default 'ready' check (status in ('ready', 'assigned')),
  -- Salted hash of the visitor's address, to limit copies per visitor; never the address itself.
  visitor_hash text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  expires_at timestamptz
);
create index demo_sandbox_ready_idx on demo_sandbox (status, created_at);
create index demo_sandbox_visitor_idx on demo_sandbox (visitor_hash, assigned_at);
alter table demo_sandbox enable row level security;
