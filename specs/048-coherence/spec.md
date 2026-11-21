# 048 — Coherence: one system instead of parallel lists

**Branch**: `048-coherence` · **Status**: delivered for review

## Why

The review of 2026-11-21 (Last Planner System, ISO 19650, HKA CRUX, technology acceptance studies)
found the core coherent — the day's report feeds progress, invoicing and the client — and the
recent additions built beside it without links. This spec links them, and adds the one missing
object the research puts first among dispute causes: change orders.

## What

- **Incident and task are one action.** Raising an incident creates the task that clears it, given
  to the site's manager, due in 1, 3 or 7 days by priority. Task in progress or done moves the
  incident; resolving or reopening the incident moves the task.
- **Tasks in the planning.** A task may aim at a milestone or a phase of its own site; « This week »
  filter (due within 7 days or late); late tasks appear in the alerts and the morning digest.
- **Checklists.** Settings › Checklists: create, edit, remove; each is daily, during a phase (shown
  while a phase of that name is under way on the site) or on demand. Defaults: « before pouring »
  during the structural work, « receiving materials » on demand. On a quality check (during a phase or on demand), unticked points become an
  incident (defect) with its task; a daily routine left incomplete stays on record without one.
- **Document families.** Administrative, technical, other (defaults from the type, drawings by title);
  « Drawings and technical » tab in Documents; the field's « Plans » tab shows the technical ones only.
- **Change orders (`change_order`).** Number per site, subject, detail, amount, days added. Draft →
  sent to the client's space → accepted or refused there (named, journaled, `security definer`
  functions keyed by the hashed token) or recorded by the office for an answer given in person.
  Contract value = budget + accepted. An accepted one is invoiced once.
- **Day journal.** Per site and day: reports with photos, who was present, deliveries, incidents
  raised, checklists; « Journal » tab and `/print/journal` to print or save as PDF. Nothing to type.
- **Worker import** by pasting spreadsheet lines (name; trade; phone; day rate).

## Proof

`packages/core/tests/coherence.test.ts` (8 scenarios); `pnpm check` green (94 tests).
