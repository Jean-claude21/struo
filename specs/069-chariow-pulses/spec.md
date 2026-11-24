# 069 — Licences applied by themselves (Chariow Pulses)

**Branch**: `069-chariow-pulses` (base `dev`) · **Status**: delivered for review

- The founder links each Chariow product to a plan and a duration (Console › Licences, as before).
  The « Buy » button in Settings › Licence opens the store's page with the person's e-mail and name
  filled in.
- Chariow sends a **Pulse** (signed webhook) to `POST /api/payments/chariow`. Struo checks
  `x-chariow-signature` (`sha256=` + HMAC-SHA256 of the raw body with the Pulse secret `whsec_…`,
  variable `CHARIOW_PULSE_SECRET`, several comma-separated to rotate), keeps each
  `x-pulse-delivery-id` once (retries change nothing, table `store_pulse`, migration `0037`).
- On `license.issued`: the buyer's company is the real company where the buyer's e-mail is owner or
  admin; the key is checked and activated with the store (as when pasted by hand), the paid period
  extended, the space reopened, and the buyer gets an e-mail. Other events are only recorded.
- No company for that e-mail, or a failure: the founder is e-mailed and the customer can still paste
  the key by hand. A key already entered by hand is recognised (« already entered »).
- Console › Licences: the address to paste in the Pulse, whether the secret is set, the last deliveries
  with what Struo did.
- Tests: signature (good, rotated, wrong secret, changed body, missing header), once-only deliveries,
  buyer matching. Checked on a local server: bad signature 401, unknown buyer recorded, retry ignored.
