# 011 — MCP server

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- API keys per company (hash stored), acting as their creator
- Everyday tools + tool groups per domain

## Acceptance and proof

- Key acts in its company only; revoked key refused (business.test.ts)
- Verified over HTTP: initialize, tools/list (10 tools), finance summary

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
