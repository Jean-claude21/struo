-- Spec 062: the founder decides whether the public site shows prices or « on quote » for everyone.
-- Off by default: every plan is shown « on quote » and visitors are asked to be called back.
alter table platform_settings add column public_prices boolean not null default false;
