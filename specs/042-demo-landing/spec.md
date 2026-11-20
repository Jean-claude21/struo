# 042 — Try without an account, and the « clarity » landing page

**Branch**: `042-demo-landing` · **Status**: delivered for review

## The angle

From the pilot client's own words: **clarity on every site — what happens, when, where — without
being overwhelmed**, and **looking professional**. The promise: « Sachez ce qui se passe sur tous vos
chantiers. Sans courir après personne. » Proof and payment are the mechanism, not the headline.

## Landing page (`/`)

Seven blocks, one main action repeated (« Voir la démo, sans compte »), the trial as second action:

1. **Promise and product**: the headline, and a live « Today » board — a map of the company’s five sites
   and a feed of the day's events (what, when, where) that updates every few seconds.
2. **The problem as they live it**: you have to call to know; everything is scattered; the client doubts.
3. **What, when, where on one screen** (dark band): a photo report, a planning with a late milestone,
   sites with their state.
4. **Professionalism — what your clients see of you**: clean reports, correct invoices, a client
   space; costs and margins never shown to clients.
5. **Effort — as simple as WhatsApp**: four gestures, and an offline simulator (cut the network, add a
   report, turn it back on).
6. **The offer « Démarrage Chantiers Clairs »**: what is included (import done for you, 20-minute
   training, first report the same day…), the real plans and prices, the conditional guarantee
   (one report per working day for 30 days after training, or the second month is free).
7. **Questions, then the last call.**

Hormozi's value equation: dream outcome (clarity, image), likelihood (live board, demo), time (first
report the same day), effort (WhatsApp-simple, done-for-you import), risk (guarantee). Evidence from
landing-page studies: customer language, one main action, proof next to the action. No invented
testimonial, figure or customer. Generated photographs (no real person or site) in `public/landing/`.
Clicks on the main actions are counted in Umami (`data-umami-event`).

## Try without an account (`/demo`)

- The visitor picks a role (manager, site lead, client; or engineer, accountant): their **own copy**
  of the fictional company « Kekeli Construction » opens, signed in, with no form.
- Copies are **prepared in advance** (2 kept ready; `DEMO_POOL`), from the same scenario as the seeded
  demo (`apps/web/scripts/demo-company.ts`); photos are stored once and shared. A copy lives **24 hours**
  and is then deleted with its accounts (`demo_sandbox`, migration 0017).
- A **demo bar** on every page (office, field app, client space): fictional company, until when,
  nothing is sent; « see as » each role; « Créer mon espace » (signs out, opens sign-up).
- **Guards**: at most 10 copies per address per day (mobile operators share addresses; salted hash,
  never the address) and 150 copies alive at once;
  a demo company sends **no e-mail and no WhatsApp** (reminders, invitations, client invitations are
  recorded only); its assistant has a 30-cent budget; demo companies are excluded from product health.
- `DEMO_ENABLED=false` turns it off.

## Proof

End-to-end on a local server (14 checks): landing and demo pages render with no missing text; a copy
opens as manager in 5.8 s when none is ready (instant otherwise), the office shows the demo bar;
switching to site lead, engineer, accountant and client lands on the field app, the field review,
finances and the client space of the same copy; the per-address limit refuses copies beyond it;
leaving signs out and opens sign-up; shared photos are served in a copy.
