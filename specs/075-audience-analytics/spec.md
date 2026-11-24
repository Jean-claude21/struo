# 075/076 — Audience completed; analytics views for the founder's dashboards

**Branch**: `075-audience` (base `dev`) · **Status**: delivered for review

## Audience (Umami)
- Where a visitor came from: the other site's origin only (`https://www.google.com`), never its path;
  nothing for Struo itself.
- Campaign parameters kept (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
  `ref`); every other parameter dropped.
- New events: `lp-demo-hero`, `lp-country` (country picked in the estimate), `lp-calc-used` (estimate
  touched), `lp-proof-seen`, `lp-pricing-seen` (section reached, once), `contact-error`.

## Analytics views (Metabase)
- Schema `analytics` (migration `0042`): companies, members, projects, field reports, incidents, tasks,
  invoices, client spaces, licences, subscription payments, AI usage, call-back requests, platform
  events, store Pulses — figures only, no personal data (no person's name, e-mail, phone, note,
  photo, message or client). Demo copies left out; internal companies flagged.
- `scripts/analytics-reader.mjs <env>`: the read-only login `struo_metabase` (these views only,
  read-only transactions, 60 s limit), password kept in the secrets file.
