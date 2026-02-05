# Release Readiness Checklist

Use this checklist before cutting a new version.

## 1) Quality gates

Run from repo root:

```bash
npm run check
npm run test -w backend
npm run test:e2e -- e2e/tests/api-contract.spec.ts
npm run test:e2e -- e2e/tests/p0.spec.ts
```

Expected outcome:
- All commands pass with no lint/format failures.
- Backend tests pass, including API contract and migration safety tests.
- API contract e2e smoke test passes for auth/services/quotas/status endpoints.
- P0 browser flows pass end-to-end.

## 2) Production smoke

Run:

```bash
npm run smoke:prod
```

Expected outcome:
- Docker image builds successfully.
- Container starts and serves `/health`, `/version`, and `/api/auth/status`.

## 3) Versioning and changelog

- Ensure `CHANGELOG.md` has concise `Unreleased` entries for all major changes.
- If releasing, bump version consistently across:
  - `package.json`
  - `backend/package.json`
  - `frontend/package.json`
  - `shared/package.json`

## 4) Final sanity

- Verify first-run setup and standard login both still work.
- Verify at least one provider refresh path works against mock provider in e2e.
- Confirm no secrets or local artifacts are staged for commit.
