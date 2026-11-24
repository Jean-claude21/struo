-- Spec 060: the end of a trial or a licence.
-- Before it ends, the company's owners and admins are warned; once it has ended, a grace period
-- keeps everything open; after it, the space turns read-only (reading and export stay, nothing new
-- is written) until a licence is entered. Both durations are the founder's, set in the console.
create table platform_settings (
  id boolean primary key default true check (id),
  licence_warn_days int not null default 14 check (licence_warn_days between 0 and 60),
  licence_grace_days int not null default 7 check (licence_grace_days between 0 and 90),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into platform_settings (id) values (true);

-- Members read it (their company's access is computed from it); only the platform writes it.
grant select on platform_settings to struo_app;
revoke insert, update, delete on platform_settings from struo_app;
