# Struo

**Run every construction site, even without network.** Struo is a multi-tenant SaaS for
construction companies in West Africa: an offline field app (PWA), invoicing and unpaid follow-up,
document compliance, costs and margins, planning, a portal for the end client with online payment,
and an MCP server so that Claude or ChatGPT can work on a company's real figures.

> *Struo* is Latin for « I build ». Working name. Product documents are in French: [vision](docs/product/vision.md).

| Door | Path | For |
|---|---|---|
| Site, pricing, sign-up | `/` | Prospects |
| Office | `/app` | Manager, engineer, accountant, admin |
| Field app (installable, offline) | `/field` | Site leads |
| Client portal (link, no account) | `/portal/:token` | End clients |
| Platform console | `/console` | The Struo team |
| REST, webhooks | `/api` | Integrations, payment providers |
| MCP | `/mcp` | Claude, ChatGPT, agents |

## Environments

| Environment | Address | Branch | Database |
|---|---|---|---|
| Production | https://struo.kete.digital | `main` | Neon `main` (Frankfurt) |
| Staging (payment simulator on) | https://struo-staging.kete.digital | `dev` | Neon `dev` |

Each merge into `dev` or `main` builds the image, publishes it to GHCR and redeploys on Coolify
(`.github/workflows/ci.yml`); `node scripts/deploy.mjs --env staging|production` provisions an
environment (Neon branch, object storage, Coolify app, variables).

## Stack

Node 22 · pnpm · TypeScript strict · TanStack Start (React 19, Vite, Nitro) · PostgreSQL 17 (Neon)
with row-level security per company · Better Auth · MCP TypeScript SDK · Vitest · one Docker image on
Coolify. See [ARCHITECTURE](docs/ARCHITECTURE.md), [decisions](docs/decisions/),
[roadmap](docs/ROADMAP.md) and the [constitution](.specify/memory/constitution.md).

## Run it locally (no Docker)

```bash
pnpm install
pnpm db:local start                       # PostgreSQL 17 cluster in .local/pgdata, port 54330 (PG_BIN if not in PATH)
DATABASE_OWNER_URL=postgresql://postgres@localhost:54330/struo APP_DB_PASSWORD=localdev pnpm db:migrate
cp .env.example apps/web/.env.local       # then fill DATABASE_URL (struo_app), DATABASE_OWNER_URL, BETTER_AUTH_SECRET
pnpm build && node --env-file=apps/web/.env.local apps/web/.output/server/index.mjs
```

Tests use a throw-away database (`TEST_DATABASE_URL`, default `postgresql://postgres@localhost:54330/struo_test`):

```bash
pnpm test        # domain, isolation between companies, money, field sync, portal, MCP keys, i18n
pnpm typecheck
```

## Connect an assistant (MCP)

Claude.ai, ChatGPT and other OAuth-capable assistants: add `https://<your-host>/mcp` as a connector;
you sign in, choose the company, and the assistant is connected (revocable in Settings → MCP & API).

With a company key instead (Settings → MCP & API), for example in Claude Code:

```bash
claude mcp add --transport http struo https://<your-host>/mcp --header "Authorization: Bearer <key>"
```

## Configuration

Every variable is listed in [.env.example](.env.example). Without the optional ones the app still
works: files on disk, e-mails written to the log, WhatsApp simulated, reminders from templates, and a
payment simulator outside production.
