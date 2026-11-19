# 025 — Field journey

**Branch**: `020-design-system` · **Status**: delivered

## What it delivers

- Home: today's site, real weather with pouring advice, checklists to do, reports sent back for details, open incidents, other sites; bottom navigation (home, sites, plans, me).
- Report in four steps (site, photos with GPS, phase progress with quick steps, voice note and weather; summary).
- Problems by tiles with severity; checklists (default templates seeded per company: before pouring, receiving materials, end of day, safety).
- Delivery notes: photographed, read automatically by OpenAI vision when online (nothing guessed: unknown fields stay empty), corrected, then signed by the deliverer on screen. Records (PV) signed on screen.
- Offline: checklists, deliveries and signatures join reports and incidents in the outbox; each carries its id, so sending twice changes nothing.

## Acceptance and proof

- Checklist and delivery idempotency, signatures isolated per company, incident follow-up by the engineer only (`journeys.test.ts`).
- Browser (phone size): home with live weather, checklist filled and received by the server.
