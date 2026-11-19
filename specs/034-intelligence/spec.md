# 034 — Struo Intelligence and a complete, documented MCP

**Branch**: `034-intelligence` · **Status**: delivered (Sign in with ChatGPT ready, switched on when OpenAI issues the client)

Inspired by Kete Intelligence (kete-africa: principles 9 and 11, D-059, D-061, D-062 rules R3, R4,
R5, R8, R9, R16, R18; kete-core spec 101; kete-enterprise spec 026), rewritten for Struo.

## Why

The assistant answered one question at a time, in one block, from a dump of figures, only on
« Today » and in Ctrl K; it could not act. The MCP exposed 29 actions out of about 90 functions and
nothing in the app said what it could do. A manager wants the assistant at hand on every screen,
doing the work for her within her rights, and the same abilities from ChatGPT or Claude.

## Rules

1. **Declared once, served everywhere.** Every ability of Struo is one capability in a single
   registry: a name, its group, a description for a model, the permission it needs, an autonomy
   level, its input schema and what it runs. The in-app assistant, the MCP server and the
   documentation page are generated from it: they cannot drift apart.
2. **The person's rights, never more.** A capability runs as the person (row-level security and the
   same permission table as the screens). A capability the role may not use is not offered at all.
3. **Autonomy levels** (Kete): 1 reads (runs); 2 changes reversibly (runs, says what changed and
   offers « Annuler » when an inverse exists); 3 prepares a decision that commits and 4 is
   irreversible, money or sent outside: the assistant only proposes a **draft card**, the person
   checks and validates it. Through MCP, levels 3 and 4 first answer a preview and only act when
   called again with `confirmed: true` after the person's yes.
4. **Visible work.** A turn streams: what it does now, each capability called with its level and a
   short result, the answer as it is written, its sources (links to the sites, invoices, reports it
   read), the drafts; « Arrêter » stops it.
5. **Who pays shows.** Three connections, chosen per person within the company's policy:
   - the company's key (default), with a monthly budget and the usage shown;
   - the person's own OpenAI key, tried before it is kept, sealed, only its last four characters
     shown;
   - **Sign in with ChatGPT**: the person's ChatGPT plan pays (OAuth 2.0 + PKCE with
     `auth.openai.com`, Responses API with her access token, refresh before expiry). OpenAI opens
     it to hosted apps through its partner programme: the flow is built and switched on by
     `OPENAI_SIWC_CLIENT_ID` (and secret); until then the screen says it is awaiting OpenAI.
     Claude will join the same connection when Anthropic offers it.
   The company's policy: `company` (it pays for everyone), `allowed` (a person's own connection
   if she has one, otherwise the company), `required` (her own connection only).
6. **Everything is journaled** with its door: `ai` for the in-app assistant, `mcp` for copilots;
   usage (tokens, estimated cost, who paid) is counted per person and per month.

## What is built

| # | Feature |
|---|---|
| F1 | Capability registry covering every office ability (sites, phases, clients, field, incidents, checklists, deliveries, signatures, finance, statements, reminders, documents, planning and dependencies, expenses, client spaces and messages, team, alerts, search, dashboards) |
| F2 | MCP generated from the registry: one tool per capability, read-only hints, previews before committing gestures, `context` first |
| F3 | Agent engine on the Responses API: function calling loop within the person's rights, streamed as NDJSON events, stop, budget check, usage counted |
| F4 | Drafts: signed, shown as cards, validated by the person (`/api/intelligence/confirm`) |
| F5 | The drawer « Struo IA » on every office page (top bar button, Ctrl J, Ctrl K question), aware of the page and the site open, suggestions per page, history of the session, voice dictation where the browser offers it; in the field app too |
| F6 | AI connections: company policy and monthly budget (owners), personal key, Sign in with ChatGPT (start, callback, refresh, disconnect), usage this month |
| F7 | Page « Intelligence & MCP »: my connection, connect ChatGPT / Claude / Claude Code step by step with the address and a test, every capability documented (what it does, who may use it, level, inputs, an example request), the journal of what the assistant and copilots did |
| F8 | Tests: registry (names, permissions, coverage of MCP), drafts signature, policy resolution, usage; i18n parity |

## Proof

- `packages/core/tests/ai.test.ts` (5): policy default, a connection only its owner reads, « company » and « required » rules, the company budget stops only what the company pays, disconnect.
- `apps/web/src/features/intelligence/registry.test.ts` (4): unique valid names, known permissions, a summary for every committing gesture, every capability documented in French and English, each role offered only what it may do.
- Live turns against the demo with the company key: « qui me doit le plus » (dashboard), late milestones (list_milestones), the next progress statement drafted as an invoice (progress_statement → create_invoice draft → validated → F-2026-0026; a tampered token refused 422), an incident moved and assigned (update_incident). As a site lead: an invoice refused in words with no substitute action; amounts said hidden for the role, never zero.
- MCP with an API key: 49 tools for an owner; `record_payment` answers a preview and records nothing until `confirmed: true`; wrong arguments refused with the reason.

## Found while testing

- The model claimed a draft and used another tool when the role lacked the right → the role's missing capabilities are named in its instructions, with « never substitute, never pretend ».
- A site lead read amounts through a site's detail (the screens hide them) → money fields are removed for roles without finance rights, marked « hidden, not zero ».
- The site lead's menu showed Finances, which then failed → menu entries carry the permission they need.
- A long list was cut before the model saw it → tool outputs kept up to 40 000 characters.
