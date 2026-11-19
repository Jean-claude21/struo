# 039 — Indicators and activity reports

**Branch**: `039-indicators-reports` · **Status**: delivered

## Indicators (`/app/indicators`, every role; money only for roles with `finance.read`)

A period selector (7 days, 30 days, this month, this quarter, 12 months, or two dates) and the
figures of the company, computed by the server in integers (`packages/core/src/kpis.ts`). Each figure
has its definition on hover (ⓘ).

| Group | Indicator | Definition |
|---|---|---|
| Money | Invoiced before VAT, collected, spent | Totals of the period |
| | Collection rate | collected ÷ (collected + still receivable) |
| | DSO | receivable today ÷ invoiced (VAT incl.) over the last 90 days × 90 |
| | Average payment delay | average of payment date − due date |
| | Receivable, overdue, overdue > 60 days | Today |
| | Cash, spending per month, runway | collected − spent; average of 3 months; cash ÷ spending |
| | Left to invoice, retentions | budget − invoiced before VAT on open sites; retentions withheld |
| | CPI | earned value (progress × budget) ÷ actual cost |
| Planning | SPI, sites behind | actual progress ÷ share of the schedule elapsed |
| | Late milestones, on time, average delay | Milestones past their date; reached on time; delay |
| Field | Reports, photos, to review, review time, sent back | Field reports of the period |
| | Open/critical/new incidents, resolution time | |
| | Complete checklists, deliveries with reservations | |
| Compliance | Documents in order, expired, expiring soon | |

Trends over 12 months (invoiced, collected, spent; reports and incidents) and a table of every open
site: progress, planned, SPI, and for money roles CPI, projected margin and overdue.

## Activity report (`/print/report?from&to`)

The same figures, the sites table and what happened in the period (invoices issued, payments
received, milestones reached, incidents reported), with the company's logo; « Print / PDF » makes
the file. A site lead's report carries no money.

## For the assistant and MCP

The `indicators` capability (read, every role, money gated) returns the same figures for a period.

## Periodic e-mails

Every Monday (the past week) and every 1st (the past month), after 7:00 UTC, owners and admins of
each active company receive the key indicators and the link to the full report. `notification_log`
guarantees one send per company and period; suspended companies receive nothing.

## Proof

- `packages/core/tests/kpis.test.ts` (2): exact money of the period and a site's CPI; a site lead
  gets no finance block, no CPI per site, no money in the trend or the activity.
- `apps/web/src/server/reports.test.ts`: the weekly and monthly periods by date.
- Local demo (Kekeli): DSO 58 d, CPI 1.17, SPI 0.76, 77 % documents in order; site lead sees no money.

## Also in this delivery

The milestone dialog chooses the milestones it waits for (any site) and a minimum gap, at creation
(the planning dependencies of spec 033 were only editable afterwards).
