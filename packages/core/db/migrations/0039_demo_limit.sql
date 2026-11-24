-- Spec 072: how many demos one address may open per day is the founder's (0 = no limit), so the
-- founder can test freely or open the demo wide during an event.
alter table platform_settings add column demo_per_day int not null default 10 check (demo_per_day between 0 and 1000);
