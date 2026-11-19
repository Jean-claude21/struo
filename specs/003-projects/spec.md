# 003 — Projects and clients

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- Clients (individual, company, public)
- Projects with type, client, manager, dates, status, budget, phases from the template
- Search and filters
- CSV import of an existing spreadsheet (FR/EN headers, dates dd/mm/yyyy, amounts with spaces)

## Acceptance and proof

- Import creates types and clients, refuses bad lines (business.test.ts)
- Project progress weighted by phase budgets

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
