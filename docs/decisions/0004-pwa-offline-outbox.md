# 0004 — Field app as a PWA with an IndexedDB outbox

Date: 2026-11-19 · Status: accepted

## Context

No native apps; sites outside cities have unstable networks.

## Decision

/field renders in the browser only, is installable (manifest, service worker caching the shell and hashed assets) and keeps its data in IndexedDB: the last snapshot, and an outbox of reports and incidents. Each item carries a uuid generated on the phone, used as the idempotency key by the server. Photos are resized to 1600 px JPEG on the phone.

## Consequences

Works offline on Android. Limits known: on iOS there is no background sync (sync when the app is open) and push needs the app on the home screen.
