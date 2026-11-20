# 047 — Photo viewer, field crew, subcontractors

**Branch**: `047-crew-viewer` · **Status**: delivered for review

## Why

Photos opened in a new browser tab, one at a time. Labour, often a site's biggest cost, was missing:
no one knew who worked where, and the margin ignored it. Many companies also pay jobbers by the task.

## Photo viewer

One viewer for every photo (Today, site page, field review, report cards, library, client portal):
full screen over the page, previous and next by arrows, swipe or thumbnails, the photo's context
(site, phase, author, time, place, link to the site), zoom on double click, download, Escape closes;
neighbours preloaded.

## Field crew (`worker`, `worker_attendance`, migration 0021)

- Workers have no account: name, trade, phone, day rate, active. Created by owner, admin, engineer,
  accountant (`crew.write`); **day rates are seen and changed only by owner, admin, accountant**
  (`crew.rates`).
- In the day's report, the site lead ticks who is present (offline like the rest), starting from the
  last day's crew on that site. The office corrects a day on « Équipe terrain › Présences ».
- Today shows « On the sites: N on S sites »; each site has a « Labour » tab: days worked, people, and
  the estimated cost (presences × current day rate) for the roles that see rates. The estimate is not
  added to the margin: labour paid is recorded as expenses, and counting both would double it.
- Screen `crew` (owner, admin, engineer, accountant).

## Subcontractors (`subcontract`, `expense.subcontract_id`)

Agreed amount, progress, paid, still due on the work done (agreed × progress − paid, never below
zero). Paying records an expense of the site (category subcontracting) linked to the contract, so
the margin counts it once.

## Field app

The site lead sees the open tasks given to them on the site and marks them done (network needed).

## Proof

`packages/core/tests/crew.test.ts` (rates visibility, presences from the report and the office,
labour cost, outsiders refused, subcontract payments as expenses); `pnpm check` green; screens
walked in the browser (crew, subcontracts, viewer, field report on a phone).
