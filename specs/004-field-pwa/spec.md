# 004 — Field app offline

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- Installable PWA /field, service worker, IndexedDB snapshot and outbox
- Report: site, photos (resized on the phone, GPS, time), phase progress, observation
- Incidents: kind, priority, description
- Idempotent sync; office validation applies the progress

## Acceptance and proof

- Same report sent twice is created once (business.test.ts, verified over HTTP: 201 then 200)
- Progress applied only after validation

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
