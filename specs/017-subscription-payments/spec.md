# 017 — Subscription payments

**Branch**: `017-subscription-payments` · **Status**: delivered

## What it delivers

- Settings → Subscription: choose a plan and a duration (1, 3, 6 or 12 months), pay online; history of payments; « paid until » and a notice (also on the dashboard) when the paid period is over.
- The platform account: Moneroo with `PLATFORM_MONEROO_SECRET_KEY` / `PLATFORM_MONEROO_WEBHOOK_SECRET` (webhook `/api/payments/webhook/platform`, signature checked, payment re-read), or the simulator in test environments.
- `subscription_payment` (migration 0009): amount computed from the plan table; only the platform (owner connection) settles a payment.

## Acceptance and proof

- Site lead refused, trial not payable, 3 months of Pro = 225,000 XOF, application role cannot mark paid, applied once, paid period extended ~90 days (`business.test.ts`).
- Browser: Settings → pay → simulator → plan Starter, paid until one month later, history « Paid ».
- Not verified: a real Moneroo platform account (keys not provided yet).
