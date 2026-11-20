# 041 — Monitoring: errors, availability, audience and product health

**Branch**: `041-monitoring` · **Status**: delivered

## Tools (nothing installed on the server)

| Need | Tool | What is set up |
|---|---|---|
| Errors | Sentry (EU), project `struo` | Server functions, REST/file routes, scheduled jobs, account e-mails, the shell; the browser (pages that break, lazy-loaded after the page is interactive); the field app's outbox when the server refuses an item (5xx) or an item stays stuck after 3 attempts. Release = commit, environment = production / staging / development. |
| Alerts | Sentry default rule | E-mail on new high-priority issues. |
| Availability | Sentry uptime | `/api/health` of production and staging checked every minute (outside our server, so it alerts even if the server is down). |
| Jobs | Sentry cron check-in `struo-jobs` | Every 15 minutes; a job loop that stops raises an alert. |
| Audience | Umami (`umami.kete.digital`), site « Struo » | Production only, no cookies, limited to the production domain. |
| Product health | Platform console › « Santé produit » | Computed from the database, real companies only. |

## Privacy

Nothing personal leaves: Sentry's data collection is off for user fields, cookies, headers, bodies
and query strings; events keep the method and path only, and the person's id (never name or e-mail).
Umami sets no cookie. Demo companies are flagged (`org_settings.is_demo`, migration 0016) and never
counted in product health.

## Error page

A page that breaks shows « Cette page n'a pas pu s'afficher », says the error was reported, gives a
short code to quote to support, and offers « Réessayer » and « Retour à l'accueil ». Offline, it says
so and reminds that field reports wait on the device. Known situations (not found, signed out,
suspended company) are explained, not reported.

## Product health (console)

- **North star**: field reports per week (12 weeks), validated ones highlighted; reports per active
  site lead over 7 days (target ≥ 3); active site leads; open sites reported this week.
- **Activation** (companies of the last 90 days): first report within 48 h, median hours to the first
  report, invited a site lead, made an invoice, opened a client space.
- **Retention and revenue**: still reporting in week 4; trial → paid; real companies.

## Proof

- `packages/core/tests/health.test.ts`: twelve weeks, demo companies excluded.
- A probe error reached the `struo` project (then resolved); uptime monitors created for both
  environments.
