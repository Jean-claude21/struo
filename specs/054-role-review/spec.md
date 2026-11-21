# 054 — Review of every role, on screen

**Branch**: `054-role-review` (base `053-cash-forecast`) · **Status**: delivered for review
Walk of every role with the demo after specs 050–053 (owner, site manager, site lead, accountant,
client), against `docs/product/roles.md`.

## Fixed

- **The demo names no real place.** Districts, the address, phone numbers (+228), payment brands
  (T-Money, Flooz), supplier names and the trade register were local: replaced by neutral fictional
  ones (Quartier Nord, Centre-ville, « Paiement mobile », Quincaillerie Centrale…). The invoice
  preview example, the phone hints and an old help text too.
- **The demo opened on « −34 M in 30 days »**: its fictional bank balance was too low for its pace of
  spending. Raised so the first screen tells a believable story (the low point stays visible).
- **Contract shown « in order » in compliance but « no contract » on the site overview**: required
  contract documents were filed as administrative. Contracts, quotes and change orders now belong to
  « Contract and quote », on existing sites (migration) and new ones.
- **Required documents of sites created after spec 048 were filed « other »**, i.e. shown with the
  drawings in « Drawings and technical » and in the field app's plans: filed by kind at creation
  (contract, technical, administrative) and repaired on existing sites.

## Seen and kept

- Owner home: declared payments, receivables, « in 30 days », margins, alerts, map, clients.
- Site manager home: material requests, notifications card, reports to review, incidents.
- Site lead (field app): notifications card, weather, actions of the day, tasks, Office tab.
- Accountant home: declared payments, aging, last payments.
- Client space: new since the visit, to do, money, how to pay, reports, photos by stage.

## Open (decisions for the product owner)

- The demo company's coordinates are real (map tiles and weather show the city); its country is
  stored for its currency (XOF). Moving them is a choice of market for the demo.
- An invoice PDF from the client space.

## Tests

`client-trust.test.ts`: required documents of a new site are never « other »; contracts are
« Contract and quote ».
