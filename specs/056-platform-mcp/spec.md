# 056 — The console through MCP, features granted to one company, invoices for the client

**Branch**: `056-platform-mcp` (base `055-founder-console`) · **Status**: delivered for review

## The console through MCP
- **OAuth first (056 bis)**: `/mcp/platform` is a second OAuth protected resource (its own metadata
  at `/.well-known/oauth-protected-resource/mcp/platform`; tokens bound to it). In Claude: add a
  custom connector with the address, sign in, and on the consent page a platform admin chooses
  « read only » or « read and gestures » (table `platform_mcp_grant`, migration `0033`). The access
  stops when the account leaves `PLATFORM_ADMIN_EMAILS` or the connection is revoked in Console › MCP
  access. A token for the console is refused by the company MCP, and the other way round.
- Fallback: endpoint `/mcp/platform` (Streamable HTTP, stateless) also takes a **platform key**
  (`Authorization: Bearer struo_pk_…`) created in Console › MCP access, shown once, only its hash
  kept, revocable; its creator must still be in `PLATFORM_ADMIN_EMAILS`.
- **Read-only keys** (advised for scheduled routines) only get the reading tools (15). Full keys get
  31 tools; gestures that touch a company, a plan, a price or everyone answer a **preview** first and
  act only when called again with `confirmed: true`. Every gesture is journaled.
- Reading: `platform_brief` (the whole point in one call), `revenue`, `todo_today`,
  `product_health`, `platform_runs`, `changes_since` (what a routine reports without repeating),
  `list_companies` (filters: status, plan, expires before, idle days, country, name), `company`,
  `list_requests`, `list_feedback`, `list_plans`, `plan_history`, `plan_impact`,
  `list_licence_products`, `list_announcements`.
- Changes: `add_note`, `mark_request_handled`, `mark_feedback_handled`.
- Confirmed gestures: `extend_trial`, `add_paid_months`, `set_company_plan`, `suspend_company`,
  `reactivate_company`, `grant_feature`, `revoke_feature`, `save_plan`, `restore_plan_version`,
  `set_price`, `save_licence_product`, `publish_announcement`, `end_announcement`.
- Never offered: erasing a company, a company's own data (sites, invoices…), secrets.

## Features granted to one company
- Console company drawer (and `grant_feature`): give one company a feature outside its plan (client
  space, AI, MCP, WhatsApp) until a date, with a reason; checked everywhere the plan's features are.

## Invoices for the client
- Each invoice in the client space opens in the company's look, to print or save as PDF
  (`/portal/<token>/invoice/<id>`, confirmed device, only when the space shows the money).

## Data
`0031_platform_mcp.sql`: `platform_api_key`, `company_feature_grant` (members read, the platform
writes).

## Tests
`platform-mcp.test.ts`: key hash, owner, revocation; a grant opens then closes a feature; filters,
changes since, brief. End-to-end checked locally: tools listed per key kind, brief, preview, read-only
key cannot write, no key refused.
