# 002 — Accounts and companies

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- Sign-up and sign-in (Better Auth, e-mail + password)
- Company creation: country, currency, VAT, retention, language; default trade configuration
- Members, roles (owner, admin, engineer, site_lead, accountant), invitations by link valid 7 days
- Company switcher

## Acceptance and proof

- A member never sees another company (security.test.ts)
- Roles limit writes (site lead cannot create a project)
- Last owner cannot be removed

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
