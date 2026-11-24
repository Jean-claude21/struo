-- Spec 072: the free trial is the founder's: its length, and whether the public site offers it.
alter table platform_settings add column trial_days int not null default 14 check (trial_days between 1 and 90);
alter table platform_settings add column trial_public boolean not null default true;
