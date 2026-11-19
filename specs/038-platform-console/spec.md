# 038 — The platform console and subscriptions sold as licences (Chariow)

**Branch**: `040-platform-console` · **Status**: delivered (Chariow switched on by `CHARIOW_API_KEY`)

## Console (`/console`, platform administrators: `PLATFORM_ADMIN_EMAILS`)

- **Overview**: recurring revenue, paying companies, trials ending, quiet companies, licences activated.
- **Companies**: search, and a detail per company — plan and paid period or trial, members, sites,
  reports in 30 days, issued invoices, AI questions and cost this month, licences, last activity —
  with gestures: change the plan, +14 trial days, +1 paid month, **suspend** (with a reason; nobody
  can use the company: `company_suspended`) and reactivate.
- **Chariow licences**: each Licence product created on Chariow is mapped to a plan and a duration
  (product ID, label, months, buy link); the licences companies activated, with the buyer.
- **Journal**: every gesture of the operator (`platform_journal`).

## Paying with a licence

1. The operator creates on Chariow one product of type Licence per plan and duration and maps it in
   the console (its buy link shows in the companies' Subscription tab).
2. The company buys it (mobile money or card) and receives a key.
3. In Settings › Subscription, an owner or admin pastes the key: Struo reads it at Chariow
   (`GET /v1/licenses/{key}`), refuses it when revoked, expired, of an unknown product or already used
   in Struo, activates it (`POST /v1/licenses/{key}/activate`, device `struo:<company>`), moves the
   company to the plan and extends its paid period by the product's months from today or from the end
   of the current period. The key is stored only as a hash, with its masked form.

## Proof

- `packages/core/tests/platform.test.ts` (3): a licence applied once with twelve months and a second
  one extending the period, the same key refused, an unmapped product and an accountant refused, a
  suspended company refused then reactivated, trial extended, all journaled.
