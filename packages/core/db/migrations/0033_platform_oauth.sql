-- Spec 056 bis: the console through MCP with OAuth. An assistant (Claude…) is connected to the
-- platform console by a platform admin on the consent page, read-only or not; the access token is
-- bound to the /mcp/platform resource. Platform table: the owner connection only.
create table platform_mcp_grant (
  user_id text not null references "user"(id) on delete cascade,
  client_id text not null check (length(client_id) <= 200),
  read_only boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table platform_mcp_grant enable row level security;
revoke all on platform_mcp_grant from struo_app;
