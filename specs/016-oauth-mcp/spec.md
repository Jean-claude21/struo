# 016 — OAuth for MCP clients

**Branch**: `016-oauth-mcp` · **Status**: delivered

## What it delivers

- OAuth 2.1 authorization server for MCP clients (Better Auth `mcp` plugin 1.7.14, pattern of Jarvis OS): discovery (`/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server/api/auth`), dynamic client registration, PKCE, refresh tokens. Tables in migration 0008 (checked equal to the library's schema).
- Sign-in and sign-up carry the assistant's request, then a consent page where the person chooses which company the assistant reaches (`mcp_grant`, RLS).
- `/mcp` accepts a company API key or an OAuth token; the token's person acts in the chosen company with their role.
- Settings → MCP & API: the address to give to Claude.ai or ChatGPT, the connected assistants, revocation.

## Acceptance and proof

- Browser + local client, end to end: discovery → 401 challenge → registration → authorize → consent (company chosen) → code → token (with refresh) → `tools/list` (10 tools) and `context` in the chosen company.
- Grant only for a company the person belongs to; revoked connection refused (`business.test.ts`).

## Constitution check

III the token reaches one company, chosen by the person · V generic (any OAuth client) · VII fr/en.
