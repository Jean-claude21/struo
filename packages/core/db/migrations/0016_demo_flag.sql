-- Spec 041: demonstration companies (the seeded demo, the try-without-account sandboxes) are marked,
-- so the platform's product figures only count real companies.
alter table org_settings add column is_demo boolean not null default false;
