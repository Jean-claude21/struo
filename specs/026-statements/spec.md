# 026 — Progress statements from validated progress

**Branch**: `020-design-system` · **Status**: delivered

Finances → « Prepare a progress statement »: each phase's budget times its validated progress (from reports validated by the engineer), minus progress and final invoices already issued (excl. tax); the advance is deducted in proportion of the statement to the budget. The amounts can be adjusted before creating the invoice.

Proof: figures checked in `journeys.test.ts` (25 M done, 5 M billed → 20 M; 4 M advance × 20/40 → 2 M deducted); refused to a site lead and to another company.
