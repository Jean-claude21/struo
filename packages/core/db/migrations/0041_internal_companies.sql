-- Spec 074: the founder's own companies (tests, presentations). They work like any company — e-mails,
-- licences, notifications — but stay out of the platform's figures (money, trials, health, briefs).
alter table org_settings add column is_internal boolean not null default false;
