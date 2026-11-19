# Struo — Constitution

> Struo (Latin: "I build") is a multi-tenant SaaS that runs construction companies in West Africa:
> field reports that work without network, invoicing and unpaid follow-up, document compliance,
> costs and margins, planning, a portal for the end client, and an MCP server so that Claude,
> ChatGPT or any agent can work on a company's data. This constitution governs the Spec Kit cycle
> (specify → clarify → plan → tasks → analyze → implement → converge) and every agent working here.
> It is adapted from Jarvis OS, the author's reference repository.

## Core Principles

### I. Simple and working — NON-NEGOTIABLE

Ship the simplest version that really helps a construction company. A step is done when it is
delivered, simple and working, with its proof. Complexity without a real user asking for it is
refused. A task running beyond three hours without a visible deliverable is flagged as probable
over-engineering.

### II. One core, several doors

`packages/core` holds the domain (SQL migrations and TypeScript services) and knows neither HTTP,
MCP, React nor any vendor. The web pages, the REST API, the MCP server and the scheduled jobs are
thin adapters over the same core functions. No business rule in a component, an HTTP handler or an
MCP tool. A port (storage, mail, payment, messaging, AI) never ships alone: it enters with an
adapter and a working fallback (simulator or local implementation).

### III. Every company's data is its own — NON-NEGOTIABLE

The organization is the hard boundary. Every table holding a company's data carries its `org_id`
and is created with its row-level security policy in the same migration. The application connects
with the role `struo_app`, which cannot bypass RLS; each transaction sets the acting user and the
policies let them reach only the organizations they are a member of. An MCP key acts for one
organization and nothing more. A company can export and erase its data. The end-client portal
reaches data only through `security definer` SQL functions keyed by a hashed token.

### IV. Money and statuses are exact

- Amounts are integers in minor units (`*_minor bigint`) with an ISO 4217 `currency_code`; never a
  float. Rates are basis points (`*_bps integer`, 500 = 5 %).
- Totals, balances, retentions and margins are computed by SQL from stored rows, never by the
  browser and never by a model.
- Every write goes through a core service, in a transaction, and leaves a journal row (who, what,
  before, after, through which door).
- Nothing is paid, sent to a client or deleted for good without an explicit human action.

### V. Generic by configuration

Countries, currencies, VAT, retention rate, project types, phases, required documents, alert
thresholds, roles' labels and payment providers are data, never constants in code. Opening a new
country or a new trade is a configuration, not a release.

### VI. Built for the field

- Reference device: Android 11, 2 GB RAM, unstable 3G, full sun.
- The field app is an installable PWA that keeps working offline: reads from its last sync, writes
  into an outbox, sends when the network returns. Every creation from the field carries a
  client-generated id used as its idempotency key.
- Every screen handles empty, loading, error and offline states; contrast AA; touch targets ≥ 48 px;
  a label next to every main action.

### VII. Two languages, no hard-coded text

Code, identifiers, comments and technical documents are in English. Every user-visible string goes
through the i18n catalogs (`fr` and `en`, same keys, checked by a test). Product documents
(`docs/product/`) are written in French, the author's language.

### VIII. Nothing is claimed without proof

A feature is done when its written proof is obtained: typecheck, tests and build green in CI, the
scenario passed. No invented figure or testimonial in code, docs or product copy; demo data is
fictional and marked as such. No real client data in this public repository.

## Additional Constraints

- **Stack**: Node 22 · pnpm · TypeScript strict · TanStack Start (React 19, Vite, Nitro node
  server) · Zod · PostgreSQL 17 on Neon (Frankfurt) with `pg` and versioned SQL migrations ·
  Better Auth (accounts, organizations) · official MCP TypeScript SDK · S3-compatible object
  storage · Vitest · Docker image deployed on Coolify. A separate backend is not created unless a
  need is proven; heavy work runs as the same image in a `worker` role.
- **Secrets**: none in the repository, a message, a log or a commit — the repository is public.
  `.env.example` documents every variable; gitleaks runs in CI. Never print a secret's value: only
  its name and "set" or "empty".
- **Databases**: local development and tests use a local PostgreSQL 17 cluster or the Neon `test`
  branch; Neon branches follow Git (`main` production, `dev` staging). Never start Docker on the
  author's machine. Migrations are additive: an applied migration is never edited.
- **Documentation with diagrams in the same pull request**: Mermaid in Markdown.

## Development Workflow

- **Branches**: `main` (production, the human gesture only), `dev` (integration, green CI
  required), `NNN-slug` (one Spec Kit feature, branched from `dev`). No direct push to `main`.
- **Commits**: conventional (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- **Before each task**, the five questions: the one thing to ship; the simplest version that really
  helps; for the user or to impress; what we would keep if we shipped in three hours; will the
  person waiting be helped today.

## Governance

This constitution overrides any other practice in this repository. Amendments are dated and
recorded in `docs/decisions/`. Each plan checks its compliance in its "Constitution Check".

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
