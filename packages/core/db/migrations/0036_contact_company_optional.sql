-- Spec 068: on the call-back form only the name and a way to reach the person are required; the
-- company becomes optional.
alter table contact_request drop constraint if exists contact_request_company_check;
alter table contact_request alter column company drop not null;
alter table contact_request add constraint contact_request_company_check check (company is null or length(company) between 1 and 160);
