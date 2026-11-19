# 018 — Exports and erasure

**Branch**: `018-exports` · **Status**: delivered

## What it delivers

- Accounting export: invoices, payments or expenses of a period as CSV for the accountant (`;` separator, decimal comma, BOM), `/api/export/accounting/:kind`.
- Full company export: one zip (`data.json` with every table, members and journal; photos, documents and voice notes), `/api/export/company`, owners and admins only, no secret inside (zip writer from Jarvis, no dependency).
- Erasure: the owner types the exact company name; the organization and every row go by cascade, then its files (storage prefix).

## Acceptance and proof

- CSV content and figures, export without secrets, roles, erasure by owner only with the exact name, neighbour company untouched (`business.test.ts`).
- HTTP: CSV served as attachment; zip valid (PK header) with data.json, photos/ and documents/.
