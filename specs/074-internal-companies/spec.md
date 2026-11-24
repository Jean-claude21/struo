# 074 — The platform admin needs no company; internal companies for tests

**Branch**: `074-internal-companies` (base `dev`) · **Status**: delivered for review

- A platform admin without a company lands on the console (after sign-in and after sign-up), not
  on « create your company ».
- **Internal companies** (`org_settings.is_internal`, migration `0041`): the founder's own companies
  for thorough tests or presentations. They work exactly like a real company (e-mails, licences and
  their end, notifications, client space) but stay out of the founder figures: money, trials, plan
  impact, onboarding steps, product health, « what changed » and the MCP briefs.
- Console: « Create an internal company » (onboarding marked internal when a platform admin asks),
  an « Internal company » checkbox in a company's drawer, an « Internal » badge; MCP
  `set_company_internal`.
