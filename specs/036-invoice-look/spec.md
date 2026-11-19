# 036 — How a company's invoices look

**Branch**: `038-invoice-look` · **Status**: delivered

## Why

The invoice had one fixed look and no logo (the column existed, nothing filled or printed it). A
contractor needs its own identity on what it sends, and to see the result before sending.

## What is built

- **Settings › Invoicing** (`/app/settings?tab=invoicing`): every choice on the left, **the invoice
  live on the right** — the company's latest invoice with lines (or an example) drawn with the
  settings being edited, saved in one go.
- **Look**: three layouts (classic, modern with a coloured band, compact), an accent colour
  (swatches or any colour), a font (sans or serif).
- **Logo**: PNG, JPEG or WebP up to 1 MB (SVG refused: no scripts on an invoice), left, centred or
  right, its height; public at `/api/files/logo/:org` since it is printed and shown in client spaces
  (`struo_org_logo`, security definer); the same logo fills the client space's.
- **Titles per kind** (« Situation de travaux », « Facture d'acompte »…), empty keeps the usual words.
- **What shows**: client contact details, site block, unit/quantity/price columns, paid and balance,
  amount in words (« Arrêtée la présente facture à la somme de … francs CFA », French and English),
  a signature area with the signer's name and position.
- **Company fields** printed under the legal details (licence, category, capital…), and **free
  fields per invoice** printed with its references (deadline, lot, supervisor…).
- One sheet component (`InvoiceSheet`) for the PDF and the preview: what is previewed is what prints.
- The demo company has a generated logo and fictional legal and bank details.

## Proof

- `packages/core/tests/invoicing.test.ts`: look saved (layout, colour, titles, fields), the public
  logo read without a person, a bad colour refused, free fields on the document.
- `apps/web/src/lib/words.test.ts`: French numbers as written on invoices (vingt et un, quatre-vingts,
  deux cents, quatre-vingt mille…), currencies with and without cents, English.
- Live: logo uploaded (an SVG and a site lead refused), served publicly, printed on an invoice with
  « deux cent quatre-vingt-cinq mille huit cent cinquante-cinq francs CFA ».
