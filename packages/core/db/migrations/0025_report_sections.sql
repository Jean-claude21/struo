-- Spec 050: the client report in sections, drafted then validated.
-- A report is first a draft (sections of prose, chosen photos, a note), edited by the office or by
-- an assistant; once sent it is frozen (snapshot): the client always sees what was validated.
-- Figures (progress, dates, amounts) are never stored in the prose: they come from the records.

alter table client_report
  add column status text not null default 'sent' check (status in ('draft', 'sent')),
  add column sections jsonb not null default '{}'::jsonb,
  add column photo_ids uuid[] check (photo_ids is null or cardinality(photo_ids) <= 24),
  add column snapshot jsonb,
  add column updated_at timestamptz not null default now();

update client_report set status = case when sent_at is null then 'draft' else 'sent' end;

-- The weekly report is prepared as a draft for the office to validate; sending it without a reading
-- is a separate, explicit choice.
alter table invoice_settings add column report_auto_send boolean not null default false;
