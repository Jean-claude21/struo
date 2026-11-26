# 080/081 — Home « Bâtissez votre entreprise » and the licence that renews by itself

**Branch**: `080-home-v2` (base `dev`) · **Status**: delivered for review

## Home (replaces the 061 editorial cockpit)
Written with the Kete Product Framework (`docs/product/strategy-sheet.md`), FR and EN:
hero « Bâtissez votre entreprise aussi bien que vos ouvrages » with the owner's Today screen and the
site lead's phone · the four losses of control · the estimate in the visitor's currency (kept from
061) · before / with Struo · four pillars (finance, operations, anticipation, client), each shown by
a real screen of the demo company · the five roles, each opening its own demo
(`/api/demo/start?role=…`) · the field without network · the 30-day setup (Pro) · proof = the tool
itself, no invented result · prices of the country from the database, trial links when public ·
six objections · call-back (name and a way to reach required).

- Styles scoped under `.ed2` (classes `h-`); the editorial header and footer (`.ed`) keep theirs, the
  header anchors now point to `#probleme`, `#piliers`, `#equipe`, `#offre`, `#tarifs`.
- Screens: `public/landing/ed/cap-*.webp`, taken by the e2e `captures` run on the demo company.
- Audience events kept: `lp-demo-hero`, `lp-country`, `lp-calc-used`, `lp-pricing-seen`,
  `lp-proof-seen` (now the « team » section), `contact-error`, plus `lp-role-<role>`.

## Licence texts (spec 081)
The licence applies by itself when the store's Pulse arrives (spec 069): the bar, e-mails and the
read-only message now say « renouvelez votre licence », not « saisissez une clé ». Settings › « Ma
licence »: after « Acheter » the page waits for the licence and says when it is active; the key form
is folded (« Vous avez déjà une clé, ou vous avez payé avec une autre adresse e-mail ? ») and opens
by itself only when the store is not automatic.
