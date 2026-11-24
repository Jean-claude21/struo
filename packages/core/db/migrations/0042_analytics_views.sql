-- Spec 076: what the founder's dashboards (Metabase) may read — figures about the platform, never
-- personal data: no person's name, e-mail, phone, note, photo, message or client. Companies appear by
-- name (a business, not a person). Demo copies are left out; internal companies are flagged.
-- A read-only login (created outside migrations, with its own password) is granted these views alone.
create schema if not exists analytics;

create or replace view analytics.companies as
select o.id as org_id, o.name, o."createdAt" as created_at, s.country_code, s.currency_code, s.plan_code,
       s.plan_code = 'trial' as on_trial, s.trial_ends_at, s.paid_until, s.paid_until > now() as paying,
       s.is_internal as internal, s.suspended_at is not null as suspended, s.locale,
       (select count(*)::int from member m where m."organizationId" = o.id) as members,
       (select count(*)::int from project p where p.org_id = o.id and p.archived_at is null) as projects
  from organization o join org_settings s on s.org_id = o.id
 where not s.is_demo;

create or replace view analytics.members as
select m."organizationId" as org_id, m.role, m."createdAt" as joined_at
  from member m join org_settings s on s.org_id = m."organizationId" where not s.is_demo;

create or replace view analytics.projects as
select p.org_id, p.created_at, p.status, p.start_date, p.end_date, p.budget_minor, p.currency_code, p.archived_at
  from project p join org_settings s on s.org_id = p.org_id where not s.is_demo;

create or replace view analytics.field_reports as
select r.org_id, r.created_at, r.taken_at, r.status, r.reviewed_at, r.progress_pct is not null as with_progress,
       (select count(*)::int from report_photo ph where ph.report_id = r.id) as photos
  from site_report r join org_settings s on s.org_id = r.org_id where not s.is_demo;

create or replace view analytics.incidents as
select i.org_id, i.created_at, i.kind, i.priority, i.status, i.resolved_at
  from incident i join org_settings s on s.org_id = i.org_id where not s.is_demo;

create or replace view analytics.tasks as
select t.org_id, t.created_at, t.priority, t.status, t.due_on, t.done_at
  from project_task t join org_settings s on s.org_id = t.org_id where not s.is_demo;

create or replace view analytics.invoices as
select i.org_id, i.created_at, i.issued_on, i.due_on, i.kind, i.status, i.currency_code, i.total_minor, i.net_minor
  from invoice i join org_settings s on s.org_id = i.org_id where not s.is_demo;

create or replace view analytics.client_spaces as
select l.org_id, l.created_at, l.revoked_at, l.last_seen_at
  from portal_link l join org_settings s on s.org_id = l.org_id where not s.is_demo;

create or replace view analytics.licences as
select r.org_id, r.redeemed_at, r.product_id, r.plan_code, r.months, r.paid_until
  from license_redemption r join org_settings s on s.org_id = r.org_id where not s.is_demo;

create or replace view analytics.subscription_payments as
select p.org_id, p.created_at, p.paid_at, p.status, p.plan_code, p.months, p.amount_minor, p.currency_code, p.provider
  from subscription_payment p join org_settings s on s.org_id = p.org_id where not s.is_demo;

create or replace view analytics.ai_usage as
select a.org_id, a.at, a.payer, a.model, a.input_tokens, a.output_tokens, a.cost_microusd
  from ai_usage a join org_settings s on s.org_id = a.org_id where not s.is_demo;

create or replace view analytics.callback_requests as
select c.created_at, c.country_code, c.locale, c.active_sites, c.handled_at, c.company is not null as with_company
  from contact_request c;

create or replace view analytics.platform_events as
select e.at, e.kind, e.name, e.ok from platform_event e;

create or replace view analytics.store_pulses as
select p.received_at, p.event, p.outcome, p.product_id from store_pulse p;

-- The application's own role does not need any of it.
revoke all on schema analytics from struo_app;
