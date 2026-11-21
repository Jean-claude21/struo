# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The buyer is the owner or manager of a construction company of 5 to 200 people. They want clarity on
every site (what is happening, when, where) without being overwhelmed, and they want to look
professional to their own clients. Daily users are the civil engineer (validates field reports,
follows the schedule), the site lead (reports from the site, often without network), the accountant
(progress claims, invoices, unpaid amounts) and the end client (follows their project and pays).

## Product Purpose

Struo is the operating system of a construction company: the field reports with photos even
offline, the office validates, plans, invoices and follows unpaid amounts, the client follows the
project in a portal. Success: the owner understands the company in one minute in the morning, and
the company's clients see an organized, professional business.

## Positioning

Professional clarity. Struo makes a construction company's good work visible: to the owner (one
calm screen of what needs attention today), to the team (each role sees only its part), and to the
client (clean reports, fair invoices, a portal to follow and sign). "Ce qui est bien géré se voit."

## Operating Context

Site leads work outdoors on modest Android phones, in full sun, on unstable mobile networks; the
office works on laptops; clients open a link sent by WhatsApp or e-mail, often from abroad. The
company runs in its own country's currency, VAT and retention rules.

## Capabilities and Constraints

- International product: marketing never names a country, city or region; currency, VAT and plan
  prices follow the visitor's or company's country.
- One TanStack Start app with doors: site, office (/app), field PWA (/field), client portal,
  platform console, REST API and MCP server. French and English, same keys.
- Field app must work offline (outbox, sync when network returns).
- Money is exact (integers in minor units), computed by the database.
- Demo: a fictional company ("Kekeli Construction"), a private 24-hour copy per visitor, one door
  per role.

## Brand Commitments

Name: Struo (Latin "I build"). Voice: plain, concrete, construction vocabulary, no hype. Existing
world in code: paper ground, site-ink green-black, terracotta/orange accent, DM Sans and DM Mono.

## Evidence on Hand

- Sourced industry figures only: PlanGrid & FMI "Construction Disconnected" (2018), McKinsey Global
  Institute "Reinventing construction" (2017).
- Photos in `public/landing/` (generated, fictional people and sites).
- No customer testimonial, logo, case study or measured Struo result exists yet: never fabricate
  one. The pilot company is not named publicly.
- No adoption guarantee is offered.

## Product Principles

1. Clarity before quantity: show what needs attention today, file the rest.
2. Each role sees its own part, nothing more.
3. The field first: if the site lead does not report, nothing else works.
4. Nothing claimed without proof.
5. The client's view of the company is part of the product.

## Accessibility & Inclusion

Field screens: Android 11, 2 GB RAM, unstable 3G, full sun; contrast AA, touch targets of at least
48 px, a text label next to every main action. Two languages (fr, en).
