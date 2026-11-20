-- Spec 045: plan prices per currency. A plan is sold in the currency of the company's (or the
-- visitor's) country; the operator sets one price per plan and currency in the console. A plan with
-- no price in a currency is shown "on quote" there, never converted. Global table (no company data),
-- read-only for the application role like `plan`.
create table plan_price (
  plan_code text not null references plan(code) on delete cascade,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  price_minor bigint not null check (price_minor > 0),
  updated_at timestamptz not null default now(),
  primary key (plan_code, currency_code)
);
revoke insert, update, delete on plan_price from struo_app;

-- The prices that existed (one currency per plan) become the first rows.
insert into plan_price (plan_code, currency_code, price_minor)
  select code, currency_code, price_minor from plan where price_minor > 0;
