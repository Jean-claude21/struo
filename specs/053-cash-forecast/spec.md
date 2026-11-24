# 053 — The money to come

**Branch**: `053-cash-forecast` (base `052-field-office`) · **Status**: delivered for review
**Answers** (`docs/product/roles.md`): owner « will I have enough to pay in 30, 60, 90 days? »;
accountant « which supplier bills to pay, and when? ».

## Supplier bills to pay

- Finance › Cash: supplier, what for, amount, due date, site (or overheads), category, reference.
  Late ones stand out. **Mark paid**: a bill of a site becomes that site's expense (margins stay
  true); a bill of overheads is only marked paid. Cancel.

## Cash forecast (13 weeks)

- **Start**: the bank balance the company gives on a day, brought up to date with what was collected
  and spent since; without it, « collected − spent » marked as an estimate.
- **In**: issued invoices on their due date. **Late invoices are not counted** (shown apart: « if the
  late ones are paid »).
- **To invoice (estimate, shown apart)**: what is left to invoice on each active site (contract +
  accepted change orders − invoiced), spread evenly until its planned end, VAT included and
  retention deducted, collected after the company's payment term.
- **Out**: supplier bills on their due date (late ones in the first week), labour at the pace of the
  last 4 weeks (presences × day rates, or labour expenses if higher), usual spending at the pace of
  the last 12 weeks (expenses not from a bill or a subcontract).
- Subcontracts left to pay have no date: shown apart, not counted.
- Shown: balance in 30 / 60 / 90 days, week by week (chart and table), the low point and a warning
  when it goes below zero, every assumption written under the table.
- The owner's home shows « in 30 days » (opening Finance › Cash).
- Seen by owner, admins and accountant (`cash.read`), not by site managers.
- MCP: `cash_forecast`, `list_supplier_bills`, `add_supplier_bill`, `pay_supplier_bill` (confirmation).

## Data

`0028_cash_forecast.sql`: `supplier_bill` (with `org_id` and RLS), `org_settings.cash_balance_minor /
cash_balance_on`.

## Tests

`cash.test.ts`: bills to pay, paid bill → site expense once, who may; forecast from the bank balance,
late invoices apart, bills by due date; « to invoice » after the payment term.
