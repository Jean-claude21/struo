# 033 — Realistic demo company and the user review it enabled

**Branch**: `033-demo-case` · **Status**: delivered

`apps/web/scripts/seed.ts` now builds « Kekeli Construction SARL » (fictional): seven people, eight
clients, nine sites at every stage, twelve months of reports with generated site photos
(`scripts/demo/photos`, no real person nor site), validated progress, invoices with late payers,
reminders and formal notices, expenses with one site over budget, milestones linked across sites,
documents expiring, incidents in every state, deliveries with signed notes, checklists and five client
spaces with conversations. Client-space links are written to `.local/seed-credentials.txt`; on staging
the photos go to the same object storage as the app (`deploy.mjs --seed`).

Walking every screen as each role with this data found and fixed:

- Field app showed the previous person's cached sites after a change of account → the cache is
  forgotten on sign-out and on 401/403, and an item written offline is only sent under its author.
- Field snapshot failed as soon as checklists existed (date returned as an object) → ISO strings.
- « Collected » meant two different rates on two pages → collected out of invoiced everywhere; Today
  now shows what is due within 30 days and the margin expected at completion (cost projected from
  progress) with the current margin.
- Client risk ignored the amount owed → the amount compared with other clients weighs in.
- Client activity was sorted by insertion, not by date.
- « To handle » listed invoices to the engineer → each role sees what it acts on; « Open » leads to
  the invoice, the incidents board, the planning or the document; « Show all ».
- Site cards: photo covered the title → fixed; cards show works and collected side by side, the end
  countdown and the site lead. Site page: dates, countdown, lead, next steps, open incidents, recent
  photos. « Projet » renamed « Chantier » everywhere in French.
- Gantt opened at the start of the oldest site and listed every phase → see 032.
- Client space: every started phase is shown as in progress.
