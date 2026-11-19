# 035 — Invoices as a building company issues them

**Branch**: `037-invoicing` · **Status**: delivered

## Why

An invoice was one amount with the site's VAT and retention, a fixed number `F-YYYY-NNNN` and no
legal or bank details: fine for a demo, not for a contractor whose client checks every lot.

## What is built

- **Draft, then issue.** A new invoice starts as a draft (`DRAFT-…`), edited freely; « Émettre » gives
  it the next number of the company series and freezes it (only cancellation remains, if unpaid).
- **Lines** (`invoice_line`, RLS): priced items (quantity × unit price, quantities to the thousandth),
  progress lines per lot (contract amount × cumulative % − already invoiced for that lot), section
  titles. The amount before VAT is the sum of the lines; every amount is a generated column.
- **Progress statement prefilled**: one line per phase from validated progress, minus what issued
  statements invoiced for that lot; statements issued before lines existed are taken off as one line
  (nothing invoiced twice); the advance is deducted in proportion.
- **Rates per invoice**: VAT (0 % with an exemption reason), retention, advance deduction.
- **Complementary deductions** (`invoice_adjustment`): withholding tax, penalties, price revision…
  as a % of the amount before or after VAT, or a fixed amount; the net takes them off.
- **References**: contract, purchase order, note, payment terms.
- **Company settings** (`invoice_settings`, Settings › Invoicing): number prefix, counter digits,
  yearly reset, default due days, legal name, tax ID, trade register, address, phone, e-mail, bank
  details, mobile money, default payment terms, footer — printed on every invoice.
- **Editor** `/app/invoices/:id`: autosave after a pause, amounts sent back by the server (never
  computed in the browser), lines reordered, PDF preview with a « DRAFT » stamp.
- **Assistant and MCP**: `prepare_invoice` (level 2: a draft with lots and items, its link) and
  `issue_invoice` (level 4: confirmation).

Left for later, on purpose: several VAT rates in one invoice, credit notes, sending the PDF by e-mail
from Struo, a bill of quantities imported from the contract.

## Proof

- `packages/core/tests/invoicing.test.ts` (4): item lines and deductions, progress per lot net of
  earlier statements and legacy ones with the advance deducted, company series and freeze, deductions
  above the invoice and a site lead refused.
- Live with the assistant on `gpt-6-luna`: a detailed statement drafted (7 lines with an extra item),
  editor and PDF render it with the draft stamp, issued after confirmation as F-2026-0027.
