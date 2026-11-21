# 052 — Field and office

**Branch**: `052-field-office` (base `051-client-app`) · **Status**: delivered for review
**Answers** (`docs/product/roles.md`): site lead « how do I write to the office? », « how do I ask
for material? », « am I told of a task? »; site manager « what does the field ask? », « am I told
in time? ».

## Phone notifications for the team

- Any member turns them on for a phone or browser (Account, the field app's « Me » tab, and a card on
  the field home and the site manager's home until it is on). Same Web Push as the client (spec 051).
- Sent: a **task given** (with its e-mail), a **report to review** and an **incident** from the field
  (to the office: owner, admins, site managers — an incident by e-mail too), a **thread message**
  (to who follows the site: its office, its site lead, whoever wrote in it), a **material request**
  (to the office, by e-mail too) and its **answer** (to who asked). Never to the person acting.
- Fixed on the way: an incident raised by a site lead gave its task to the site's lead himself, so
  nobody in the office was told; the office is now told of every incident.
- The Monday client-report draft is announced to the owner, admins and site managers (the site's
  « manager » is its site lead, who does not send client reports).

## The office, from the field

- A new **Office** tab in the field app, for the chosen site:
  - **Material**: what, how much, for when, a word; the list with where each request stands
    (to handle, ordered, delivered, cancelled) and the office's word.
  - **Site thread**: the internal thread with the office (the client never sees it); write to it.
- Both go through the outbox: written offline, sent when the network comes back, idempotent by id.
- **Office side**: « Material requests » on the site's Tasks tab and on the site manager's home:
  mark ordered, delivered (with a reminder to record the expense) or cancelled with a word.

## Data

`0027_field_office.sql`: `material_request` (with `org_id` and RLS). `project_note` accepts the id
given by the field.

## Tests

`field-office.test.ts`: a request kept once when sent twice, who may ask and who may answer, the
statuses, a thread message kept once.
