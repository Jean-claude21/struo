-- Spec 073: the notification centre and each person's choices.
-- Every notice sent to a team member is also kept here, so a phone notification missed (or never
-- turned on) is still seen in the app's bell. Each person sees and marks only their own.
create table notification (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  title text not null check (length(title) <= 200),
  body text check (length(body) <= 500),
  url text check (length(url) <= 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notification_user_idx on notification (user_id, org_id, created_at desc);
create index notification_unread_idx on notification (user_id, org_id) where read_at is null;
alter table notification enable row level security;
create policy notification_own on notification
  using (struo_is_member(org_id) and user_id = struo_user())
  with check (struo_is_member(org_id) and user_id = struo_user());
-- Members read and mark their own; notices are written by the platform (owner connection).
revoke insert, delete on notification from struo_app;

-- What each person wants, per kind of notice: on the phone, by e-mail. No row: the default.
create table notification_pref (
  org_id text not null references organization(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  push boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, kind)
);
alter table notification_pref enable row level security;
create policy notification_pref_own on notification_pref
  using (struo_is_member(org_id) and user_id = struo_user())
  with check (struo_is_member(org_id) and user_id = struo_user());
