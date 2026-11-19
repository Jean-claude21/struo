# Roadmap

Ordered list of Spec Kit features. No dates: each feature starts when the previous one is merged
into `dev` with green CI. Status: ✅ delivered with proof · 🟡 delivered, part not verified with a
real external account · ⏳ next.

| # | Feature | Delivers | Status | Proof / what is not verified |
|---|---|---|---|---|
| 001 | `001-foundation` | Monorepo, TanStack Start app, SQL migrations with RLS and the `struo_app` role, journal, i18n fr/en, CI, Docker image | ✅ | `security.test.ts`, `i18n.test.ts`; image start simulated locally (migrations then server, health ok) |
| 002 | `002-accounts-orgs` | Accounts, company creation with its settings and default trade configuration, members and roles, invitations by link | ✅ | Sign-up → company → dashboard in the browser; isolation and role tests |
| 003 | `003-projects` | Clients, projects, phases, types, statuses, search, CSV import | ✅ | Project created in the browser; CSV import test |
| 004 | `004-field-pwa` | Installable field PWA, offline outbox, photos with GPS, incidents, idempotent sync, office validation | ✅ | Report with photo sent twice over HTTP (201 then 200); incident sent from the UI; validation applied the progress. Airplane-mode test on a real phone not done yet |
| 005 | `005-finances` | Invoices (advance, progress, final) with VAT, retention and deduction, payments, aging, reminders, printable invoice | ✅ | Amounts test; invoice created in the browser (11,800,000 TTC / 11,210,000 net) |
| 006 | `006-documents` | Document types, statuses, expiry, compliance, files | ✅ | Expiry alert test; PDF upload and download over HTTP; HTML refused |
| 007 | `007-expenses` | Expenses, margin per project and segment, CPI | ✅ | Margin test |
| 008 | `008-planning` | Milestones planned vs actual, delays, consolidated Gantt | ✅ | Late milestone test |
| 009 | `009-alerts-dashboard` | Alert rules in SQL, dashboard, daily digest e-mail | 🟡 | Alerts tested and shown in the browser; digest e-mail not sent to a real inbox (needs `RESEND_API_KEY`) |
| 010 | `010-client-portal` | Portal link, progress, photos, documents, invoices, messages, milestone validation, online payment | 🟡 | Portal → simulated payment → invoice paid, in the browser; Moneroo with a real company account not tested |
| 011 | `011-mcp` | API keys, MCP server with tool groups | ✅ | Key test; initialize, tools/list (10 tools) and a finance call over HTTP |
| 012 | `012-saas` | Plans and limits, landing page with pricing, platform console | ✅ | Trial limit test; landing rendered with plans from the database. Prices are provisional |
| 013 | `013-ai` | Reminder and formal notice drafting from real figures | 🟡 | Template path; OpenAI path needs `OPENAI_API_KEY` in the environment |
| 014 | `014-whatsapp` | WhatsApp channel for reminders | 🟡 | Simulator path; real sending needs a WhatsApp Business account |
| 015 | `015-voice` | Voice notes on field reports, transcribed after sync | ✅ | Voice note test; transcription needs `OPENAI_API_KEY` (set in staging) |
| 016 | `016-oauth-mcp` | OAuth for MCP clients (Claude.ai, ChatGPT) besides API keys | ⏳ | |
| 017 | `017-subscription-payments` | Paying the subscription online (platform Moneroo account) | ⏳ | |
| 018 | `018-exports` | Accounting export, full company export (zip) and erasure | ⏳ | |
| 019 | `019-field-validation` | Field test with 2 site leads and the pilot client's manager; hypothesis: ≥ 3 reports per week per site lead for a month | ⏳ | Product risk n°1 (see vision) |

The status column is updated in the pull request that delivers the feature, with its proof.
