# 055 — The founder's console

**Branch**: `055-founder-console` (base `054-role-review`) · **Status**: delivered for review
**Answers** the platform admin's questions: how much do I earn (truly)? who renews or expired? who do
I call today? where is each company stuck? does the platform run? what do users say? can I change my
offer safely?

## True figures
- Demo companies and demo copies never count. Monthly revenue per currency (never added across
  currencies). Revenue per month includes licences sold on Chariow (plan price × months) and
  subscription payments.

## To do today (first tab)
- Follow-up reminders due, problems reported, subscriptions expired (30 d) or expiring (14 d), idle
  trials ending in 7 days, paying companies with no report for 14 days, unhandled requests. Each with
  e-mail and WhatsApp buttons.
- Company drawer: getting-started steps (first site, team, first report, first validated report,
  first invoice, client invited) and follow-up notes with a reminder date. The company list shows
  the steps, hides demos by default, and has contact buttons.

## Does the platform run? (« Platform » tab)
- Each automatic job's last run (ok, failing, or silent for more than 45 minutes) and failures in
  24 h; e-mails and phone notifications that failed (7 d); AI cost this month for the platform;
  demos opened by role, « create my space » clicks and sign-ups (30 d).

## Plans, edited with care (« Plans » tab)
- Name, « for whom » and « what is included » in French and English (one line = one point,
  **bold** only), user and site limits, features, highlighted plan (one at most), visible or hidden,
  order; new plans (fixed code). Prices stay in the Prices tab.
- **Features are now enforced where used**: client space (portal links), AI assistant (assistant and
  client-report writing), MCP and API keys, WhatsApp sending. The trial includes everything Pro has.
- **Before saving**: who is touched — companies and paying ones, features lost or gained, companies
  above a new limit (they keep everything but cannot add more), a plan leaving the public offer.
  When paying companies lose something, the founder must type the plan code to confirm.
- **Every version is kept** (with who and a note) and can be restored. Periods already paid never
  change; a new price applies at the next purchase.
- The home page and Settings › Subscription show the words set in the console (the catalogue's text
  until then; the editor starts from it).

## Licences
- Each Chariow product has a description (French, English), a highlight and an order; Settings ›
  Subscription shows each offer as a card with its price in the company's currency (plan price ×
  months) and a « Buy » button.

## Announcements and feedback
- An announcement shows as a banner in the app for every company until its date; it can also be
  e-mailed once to every owner (confirmation asked).
- « A problem? An idea? » in the app: a member writes, the page is attached; read and handled in the
  console (problems also appear in « To do »).

## Audience analytics (Umami), made safe
- Only public pages are counted (home, demo, sign-up, login, password forgotten, onboarding), by
  path alone: never the client space, an invitation or a link carrying a code. Successes counted:
  sign-up done, company created, contact request sent.

## Data
`0030_founder_console.sql`: `platform_event`, `company_note`, `announcement`, `feedback` (RLS),
`plan_revision`, plan words and highlight, licence product description/highlight/position.

## Not in this spec
Seeing a client's account (consent, time-boxed, journaled): to discuss first.

## Tests
`founder.test.ts`: demo excluded, today's list; a plan change shows its impact, asks for the code,
really removes the feature, is restored with its history; words, new plan, one highlight;
announcement period; feedback.
