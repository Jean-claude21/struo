# 0005 — Online payments go to each company's own account

Date: 2026-11-19 · Status: accepted

## Context

Clients pay the construction company, not Struo; holding their money would make Struo a payment intermediary.

## Decision

Each company stores its own Moneroo keys (encrypted with AES-256-GCM, SECRETS_KEY). The portal opens a payment intent; the signed webhook is verified with that company's secret, the payment is re-read at Moneroo, then applied once (idempotent). A simulator exists for tests and demos, disabled in production unless PAYMENTS_SIMULATOR=true.

## Consequences

Pattern from DYM (spec 088).
