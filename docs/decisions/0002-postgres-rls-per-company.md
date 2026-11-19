# 0002 — PostgreSQL with row-level security per company

Date: 2026-11-19 · Status: accepted

## Context

A multi-tenant SaaS must make leaking a company's data to another impossible, not merely unlikely.

## Decision

Every company table carries org_id and the policy struo_is_member(org_id). The app connects as struo_app (NOBYPASSRLS) and sets struo.user_id per transaction (pattern of Jarvis OS). Raw SQL migrations, no ORM.

## Consequences

Isolation is enforced by the database itself and tested (security.test.ts). Pattern from Jarvis' spaces.
