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
| 013 | `013-ai` | Reminder and formal notice drafting from real figures | ✅ | Verified on staging with the real OpenAI key: the draft quotes the real number, dates, balance and company |
| 014 | `014-whatsapp` | WhatsApp channel for reminders | 🟡 | Simulator path; real sending needs a WhatsApp Business account |
| 015 | `015-voice` | Voice notes on field reports, transcribed after sync | ✅ | Voice note test; verified on staging: a spoken note uploaded and transcribed by OpenAI |
| 016 | `016-oauth-mcp` | OAuth for MCP clients (Claude.ai, ChatGPT) besides API keys | ✅ | Full OAuth flow verified locally with a PKCE client; grant and revocation tests |
| 017 | `017-subscription-payments` | Paying the subscription online (platform Moneroo account) | 🟡 | Tests and browser flow with the simulator; real platform Moneroo keys not provided yet |
| 018 | `018-exports` | Accounting export, full company export (zip) and erasure | ✅ | Export and erasure tests; CSV and zip downloaded over HTTP |
| 020 | `020-design-system` | Design tokens with a dark theme, UI kit, new shell (company switcher, Ctrl K palette, create menu), `/app/system` | ✅ | Browser checks desktop and phone; i18n parity |
| 021 | `021-views` | View engine with table, board, Gantt, calendar and file explorer; Finances, Sites, Planning, Documents rebuilt on it | ✅ | Board refusal and Gantt move with undo in the browser; isolation tests |
| 022 | `022-client-journey` | Client invitation (WhatsApp, e-mail, link, visibility), client space confirmed by e-mail code, finger signature of milestones | ✅ | `journeys.test.ts`; browser flow from invitation to signature |
| 023 | `023-today` | « Today » per role: decisions, cash, risk score, client activity, weather with pouring advice, phase matrix | ✅ | Browser with demo data; isolation test |
| 024 | `024-team` | Team page, role-first invitation | ✅ | Browser |
| 025 | `025-field-journey` | Field app: day actions, checklists, 4-step report, problems, delivery notes read by OCR and signed, records signed | ✅ | `journeys.test.ts`; checklist received from a phone-size browser |
| 026 | `026-statements` | Progress statement computed from validated progress | ✅ | `journeys.test.ts` |
| 027 | `027-platform` | Platform console: revenue, trials ending, quiet companies | ✅ | Typecheck; shown to platform admins only |
| 028 | `028-landing` | Offer-led landing page with generated photos | ✅ | Rendered desktop and phone; live on production |
| 029 | `029-finalize` | Expenses and profitability, clients with risk, settings roles and journal, 3-step onboarding, manager assistant | ✅ | Staging: assistant answers from real figures; every office page 200 for engineer and accountant |
| 030 | `030-release` | E-mail through Resend, OCR on staging, release to production | ✅ | Staging: invitation and access code delivered by Resend, delivery note read exactly; production smoke tests |
| 031 | `031-dependencies` | Real milestone dependencies (across sites, with gap, cascade, undo, loops refused) and dated phases | ✅ | `dependencies.test.ts` |
| 032 | `032-pro-views` | Every behaviour of the reference views: menus, inline edit, quick add, layers, folding Gantt, shortcuts, file drop | ✅ | Walked in the browser as owner, engineer, accountant, site lead, client |
| 033 | `033-demo-case` | Realistic demo company with photos, and the fixes found by walking every screen | ✅ | Local and staging seed; field cache privacy fix |
| 034 | `034-intelligence` | Struo Intelligence beside every page (live turns, capabilities with autonomy levels, drafts to validate), one capability registry generating the MCP (49 tools) and its documentation, AI connections: company key with budget, personal key, Sign in with ChatGPT | ✅ | `ai.test.ts`, `registry.test.ts`; live turns and MCP checked |
| 035 | `035-invoicing` | Invoices with lines (items, progress per lot, titles), drafts then issue with the company's number series, complementary deductions, legal and bank details, editor and PDF; assistant on `gpt-6-luna` | ✅ | `invoicing.test.ts`; live draft → issue |
| 036 | `036-invoice-look` | Invoice look with live preview: three layouts, colour, font, logo (position, size), titles per kind, blocks and columns to show, amount in words, signature, company and per-invoice fields | ✅ | `invoicing.test.ts`, `words.test.ts`; logo printed live |
| 037 | `037-library-by-day` | Library « by day » view: files grouped per day with sites, authors and jump to a day | ✅ | Typecheck, filters shared with grid and list |
| 038 | `038-platform-console` | Platform console complete (companies detail, suspend, trial and paid extensions, journal) and subscriptions paid with Chariow licences | ✅ | `platform.test.ts`; Chariow on once the key is set |
| 039 | `039-indicators-reports` | Indicators (DSO, collection, runway, CPI, SPI, field, compliance) with definitions and trends, printable activity report, weekly and monthly e-mails; predecessors chosen when creating a milestone | ✅ | `kpis.test.ts`, `reports.test.ts` |
| 040 | `040-account-emails` | Forgotten password and reset (1 h link, sessions closed, « changed » mail), address verification with reminder, My account (name, address change, password, other devices), branded bilingual e-mails, invitation e-mail | ✅ | `mail.test.ts`, 23 end-to-end checks |
| 041 | `041-monitoring` | Error tracking (server, browser, field sync, jobs, e-mails) with alerts and uptime checks, cookieless audience in production, branded error page, « Santé produit » console tab (north star, activation, retention, conversion) | ✅ | `health.test.ts`, probe event received |
| 042 | `042-demo-landing` | « Clarity » landing (live Today board, what/when/where, professionalism, offline simulator, offer « Démarrage Chantiers Clairs ») and try without an account (private 24 h copy per visitor, every role, demo bar, nothing sent) | ✅ | 14 end-to-end checks; guarantee withdrawn in 045 |
| 045 | `045-landing-clarity` | Landing « Ce qui est bien géré se voit » (Impeccable), sourced figures and estimate, prices per country currency, call-back requests, screens per role (demo and real use), site map on Today | 🟡 for review | `growth.test.ts`; every demo role walked |
| 046 | `045-landing-clarity` | Tasks given per site (page and site tab), internal thread per site, document versions kept and downloadable | 🟡 for review | `work.test.ts` |
| 047 | `047-crew-viewer` | One photo viewer everywhere; field crew (workers, presences ticked in the day report, labour per site), subcontractors paid as expenses; tasks in the field app | 🟡 for review | `crew.test.ts` |
| 048 | `048-coherence` | Incident ↔ task as one action, tasks on milestones and phases, late-task alerts, checklist settings by phase, document families, change orders accepted in the portal, day journal, worker import | 🟡 for review | `coherence.test.ts` |
| 049 | `049-client-report` | Client report in the company look (preview, send, print, weekly, in the client space), e-mail notifications: task given, change order to approve | 🟡 for review | `client-report.test.ts` |
| 050 | `050-client-report-v2` | No online payment from the client space, validated photos only, « Contract and quote » documents; client report in sections drafted from the facts (assistant or template), chosen photos, frozen when sent, Monday draft to read, PDF, MCP tools | 🟡 for review | `client-trust.test.ts`, `client-report.test.ts` |
| 051 | `051-client-app` | The client's application: home with new-since-visit and to-do, reports and photos by stage, money and how to pay, « I paid » confirmed by the accountant, e-mail choice, installable space and phone notifications | 🟡 for review | `client-app.test.ts` |
| 052 | `052-field-office` | Field ↔ office: phone notifications for the team (tasks, reports, incidents, thread, material), field Office tab with the site thread and material requests (offline), office queue of requests | 🟡 for review | `field-office.test.ts` |
| 053 | `053-cash-forecast` | Supplier bills to pay (paid → site expense), cash forecast at 30/60/90 days from recorded money (late invoices apart, to-invoice estimate, recent pace), owner's home tile, MCP tools | 🟡 for review | `cash.test.ts` |
| 054 | `054-role-review` | Every role walked on screen: demo names no real place, believable cash story, contracts and required documents filed by kind | 🟡 for review | `client-trust.test.ts` |
| 055 | `055-founder-console` | Founder's console: true money (no demo, per currency, licences), to-do today, getting-started steps and notes, platform runs, plans edited with impact/confirmation/history and enforced features, licence descriptions, announcements, in-app feedback, Umami on public pages only | 🟡 for review | `founder.test.ts` |
| 056 | `056-platform-mcp` | The console through MCP (platform keys, read-only for routines, 31 tools with preview/confirmation), features granted to one company until a date, invoices as PDF in the client space | 🟡 for review | `platform-mcp.test.ts` |
| 019 | `019-field-validation` | Field test with 2 site leads and the pilot client's manager; hypothesis: ≥ 3 reports per week per site lead for a month | ⏳ | Product risk n°1 (see vision) |

The status column is updated in the pull request that delivers the feature, with its proof.
