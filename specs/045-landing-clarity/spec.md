# 045 — « Ce qui est bien géré se voit » : landing, country prices, roles' screens, site map

**Branch**: `045-landing-clarity` · **Status**: delivered for review

## Why

The pilot client asked for clarity on every site (what, when, where) without being overwhelmed, and
for looking professional. Struo is international: a visitor sees the price of their own country, in
its currency. Each role must only see the screens that concern it, in the demo and in real use. The
adoption guarantee of 042 is withdrawn.

## Landing page (`/`)

Design with Impeccable (`apps/web/PRODUCT.md`, surface brief in `apps/web/.impeccable/surfaces/`),
after the user's chosen reference: a site-ink hero with the live « Today » console (map, signals of the
day), an orange ribbon of the day's events, then paper and ink bands.

1. Promise: « Ce qui est bien géré se voit. » — demo (main action), trial.
2. The work done well stays invisible: three pains, as the clients say them.
3. What it costs: sourced figures only (PlanGrid & FMI, *Construction Disconnected*, 2018), then the
   visitor's own estimate in their currency, next to the Pro price when there is one. Indicative, said so.
4. What, when, where — without the overload.
5. One level up: the offline simulator, money, the client portal.
6. Each role sees its part: one link per role opens that role's demo.
7. Everything in Struo today (features index; MCP marked advanced).
8. The offer (four steps of the launch) and **the price of your country** (country picker).
9. Call-back form, questions, final call. No guarantee, no testimonial.

## Prices per country (`plan_price`)

- One price per plan and currency (`plan_price`, migration 0018), set by the operator in the console
  (« Prix » tab). The previous single prices (XOF) are the first rows.
- The visitor's country: picked country (cookie `struo_country`), else a country header from a proxy or
  CDN, else the region of the browser's language, else France. Its currency chooses the prices.
- A plan without a price in that currency is shown **on quote**; a price is never converted.
- A company sees and pays its plan in its own currency; no price there means no online payment.

## Contact requests (`contact_request`, migration 0019)

A prospect leaves name, company, a way to reach them, the number of sites and a question. Kept once
per contact and hour, a filled honeypot is dropped; the operator sees them in the console
(« Demandes » tab) and marks them handled.

## Screens per role

`SCREENS` in `packages/core/src/permissions.ts`: the office screens each role works with. The menu,
the command palette and direct URLs follow it; a screen outside the role leads to its start (the field
app for the site lead). Reading rights are unchanged.

| Role | Screens |
|---|---|
| Owner, admin | all |
| Engineer | Today, sites, planning, indicators, field, expenses, documents, clients, assistant |
| Accountant | Today, sites, indicators, finance, expenses, documents, clients, assistant |
| Site lead | field app (`/field`) and their account |
| Client | the portal of their project |

## Site map

On Today (manager and engineer): every site with coordinates on an OpenStreetMap map, coloured by
state — incident (open incident or money overdue > 30 days), to watch (collection lagging or no report
for 3 days on an active site), up to date, done — a filter by state, and the chosen site's card (progress,
last report, open incidents, link). Sites without a position are listed under the map.

## Proof

`packages/core/tests/growth.test.ts` (screens, prices, contact requests); `pnpm check` green; the
landing and every demo role walked in the browser.
