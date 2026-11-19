# 010 — Client portal

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- Link per project (token hashed), revocable
- Progress, phases, shared photos and documents, invoices, messages, milestone validation
- Online payment through the company own provider (Moneroo) or the simulator

## Acceptance and proof

- Revoked link shows nothing; succeeded payment applied once (business.test.ts)
- Verified in the browser: portal → payment → invoice paid

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
