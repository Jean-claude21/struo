# 050 — What reaches the client, and the client report in sections

**Branch**: `050-client-report-v2` · **Status**: delivered for review
**Answers** (see `docs/product/roles.md`): client « that happened this week, in plain words? », « do I
only see what was validated? »; site manager « what do I tell the client? ».

## Step 0 — what reaches the client

- **No online payment from the client space.** Companies collect payment their own way. Removed: the
  pay button, the company payment-provider settings tab, the simulator checkout page and the company
  payment webhook (ADR 0005 superseded). The platform's own subscription payment is unchanged.
- **Only validated photos.** The client space and its file access show photos of validated field
  reports only (pending ones had not been seen by the office). The client report respects each
  photo's « shared with client » flag.
- **Document family « Contract and quote »** (signed quote, contract, signed change orders), shown on
  the site overview. A free document (no type) starts « valid » instead of « in progress ».
- The client invited from an assistant gets a sealed link too (later e-mails carry the button).
- Deploy reads `CHARIOW_API_KEY` from the admin secrets as well.

## The client report in sections

- A report is first a **draft**: four prose sections — *summary*, *what was done*, *next steps*,
  *what we need from you* — a word from the office, and the **photos chosen** among the period's
  validated ones (all ticked up to the company's number; the office unticks).
- The prose is written from the **facts only** (validated field notes, phases, milestones, change
  orders and stage sign-offs waiting for the client): by the assistant when configured, else by a
  plain template. Each section can be rewritten on an instruction (« shorter », « mention the
  curing »).
- **The AI writes the words, never the figures.** Progress, dates and amounts come from the records
  and are not editable in the report. A figure written in the prose that the facts do not hold is
  flagged to the office before sending.
- **Sent = frozen.** The client sees a snapshot of what was validated; a photo validated later does
  not change it. A sent report cannot be edited; a draft can be deleted.
- **Monday**: when the company chose it, a draft of last week's report is prepared and the site's
  manager (else the owner) is e-mailed to read it. Sending it without a reading is a separate,
  explicit setting (not advised).
- The client opens it from the e-mail on their phone, and can **download it as PDF** (print). The
  office prints or saves it as PDF from the editor. A PDF attached to the e-mail comes later.
- **From Claude / ChatGPT (MCP)**: `prepare_client_report`, `client_report` (section by section, the
  photos, the figures, the facts, the warnings), `edit_client_report`, `send_client_report`
  (confirmation required).

## Data

`0024_client_trust.sql` (portal functions, document family) · `0025_report_sections.sql`
(`client_report.status / sections / photo_ids / snapshot`, `invoice_settings.report_auto_send`).

## Tests

`client-trust.test.ts`, `client-report.test.ts` (drafts, chosen photos, frozen snapshot, weekly
draft vs. automatic send, figures not in the facts).
