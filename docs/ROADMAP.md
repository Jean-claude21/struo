# Roadmap

Ordered list of Spec Kit features. No dates: each feature starts when the previous one is merged
into `dev` with green CI. Status: ✅ delivered · 🚧 in progress · ⏳ next.

| # | Feature | Delivers | Status |
|---|---|---|---|
| 001 | `001-foundation` | Monorepo, TanStack Start app, PostgreSQL migrations with RLS and the `struo_app` role, journal, i18n fr/en, CI (typecheck, tests, build, gitleaks), Docker image | ⏳ |
| 002 | `002-accounts-orgs` | Accounts (Better Auth), company creation with its settings (country, currency, VAT, retention), default configuration, members and roles, invitations by link | ⏳ |
| 003 | `003-projects` | Clients, projects, phases with budget and progress, project types, statuses, search and filters, CSV import | ⏳ |
| 004 | `004-field-pwa` | Installable field PWA: offline list of sites, report with photos (GPS, time), progress per phase, incidents, outbox with idempotent sync; office validation | ⏳ |
| 005 | `005-finances` | Progress invoices (advance, progress, final) with VAT and retention, payments (Mobile Money, transfer, cheque, cash), balances, receivables aging, reminders, printable invoice | ⏳ |
| 006 | `006-documents` | Document types per company, status per project, expiry dates, compliance rate, files | ⏳ |
| 007 | `007-expenses` | Expenses by category and supplier, real cost vs budget, margin per project and per segment | ⏳ |
| 008 | `008-planning` | Milestones planned vs actual, delays, consolidated Gantt | ⏳ |
| 009 | `009-alerts-dashboard` | Alert rules (unpaid, documents J-30/J-15/J-7, late milestones, progress/collection gap > 10 pts, critical incidents), dashboard, daily digest e-mail | ⏳ |
| 010 | `010-client-portal` | Secure link per project, progress, photos, documents, invoices due, online payment (Moneroo per company, simulator), messages, milestone validation | ⏳ |
| 011 | `011-mcp` | API keys per company, MCP server with tool groups (projects, field, finance, documents, planning, alerts) | ⏳ |
| 012 | `012-saas` | Plans and limits, landing page with pricing, platform console | ⏳ |
| 013 | `013-ai` | Drafting of payment reminders and formal notices from real figures (OpenAI through a port) | ⏳ |
| 014 | `014-whatsapp` | WhatsApp channel (Cloud API adapter + simulator) for reminders and the digest | ⏳ |
| 015 | `015-voice` | Voice notes on field reports, transcribed at sync | ⏳ |
| 016 | `016-oauth-mcp` | OAuth for MCP clients (Claude.ai, ChatGPT) in addition to API keys | ⏳ |
| 017 | `017-subscription-payments` | Paying the subscription online (Moneroo, platform account) | ⏳ |
| 018 | `018-exports` | Accounting export, full company export (zip) and erasure | ⏳ |

The status column is updated in the pull request that delivers the feature, with its proof.
