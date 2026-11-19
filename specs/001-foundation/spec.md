# 001 — Foundation

**Branch**: `001-mvp` (first delivery) · **Status**: delivered

## What it delivers

- Monorepo pnpm: packages/core, apps/web
- SQL migrations with checksum guard and advisory lock
- Role struo_app without BYPASSRLS; struo_user(), struo_is_member()
- Append-only journal
- i18n fr/en with typed keys
- CI: build, typecheck, tests on PostgreSQL 17, gitleaks, image, Coolify redeploy

## Acceptance and proof

- Every company table has RLS (security.test.ts)
- struo_app cannot bypass RLS
- Journal is append-only
- i18n keys identical in fr/en; every key used exists (i18n.test.ts)

## Constitution check

II one core, several doors · III RLS per company · IV exact money · VII fr/en · VIII proof above.
