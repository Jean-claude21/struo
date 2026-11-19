# 0003 — Typed tables for money, not Jarvis' free entries

Date: 2026-11-19 · Status: accepted

## Context

Jarvis stores everything as free entries; construction invoicing needs legal numbering, VAT and retention that never drift.

## Decision

Projects, invoices, payments, expenses, documents and milestones are real tables with constraints. Amounts are bigint minor units; VAT, totals, retention and net are generated columns; balances and margins are SQL views. What varies by company (types, phases, documents, thresholds) stays data.

## Consequences

Figures are exact and identical in every door (pages, MCP, digest).
