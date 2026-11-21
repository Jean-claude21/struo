# 0005 — Online payments go to each company's own account

Date: 2026-11-19 · Status: superseded (2026-11-21)

> **Superseded.** Companies collect payment their own way; Struo no longer takes payments from the
> client space (spec 050). The client sees what is due and how to pay (the company's own
> instructions), and can declare a payment the company confirms (spec 051). The `payment_intent` and
> `org_payment_provider` tables are kept for history only. The platform's own subscription payment is
> unaffected.

## Context

Clients pay the construction company, not Struo; holding their money would make Struo a payment intermediary.

## Decision

Each company stores its own Moneroo keys (encrypted with AES-256-GCM, SECRETS_KEY). The portal opens a payment intent; the signed webhook is verified with that company's secret, the payment is re-read at Moneroo, then applied once (idempotent). A simulator exists for tests and demos, disabled in production unless PAYMENTS_SIMULATOR=true.

## Consequences

Pattern from DYM (spec 088).
