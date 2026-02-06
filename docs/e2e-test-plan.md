# E2E Test Plan

## Goal

Add a focused, high-value end-to-end test suite that protects critical user workflows while backend and frontend refactors continue.

This plan intentionally prioritizes confidence over exhaustiveness.

## Current Coverage

The Playwright harness and P0 suite are implemented and passing locally.

**Covered (P0):**
- First-run setup and registration (setup code extraction from backend logs)
- Login, logout, and session restore
- Add service and render dashboard card (against mock provider)
- Refresh-all updates usage data (mock payload changes reflected in UI)
- Service reorder persists after reload

**Covered (API contract):**
- Auth status, registration, and login responses validated against shared schemas
- Service CRUD responses validated against shared schemas
- Quota refresh and cached status responses validated against shared schemas

**Infrastructure:**
- Framework: Playwright (`@playwright/test`)
- Mock provider: `e2e/mock-provider-server.mjs` for deterministic quota responses
- State isolation: dedicated `DATA_DIR` per run, reset via `e2e/global-setup.ts`
- Default ports: frontend `3100`, backend `3101`, mock provider `4110`
- Frontend backend override via `VITE_BACKEND_ORIGIN`
- Stable `data-testid` selectors on key UI elements

## Remaining: Phase 2 (P1/P2)

6. Delete service confirmation flow (cancel vs confirm)
7. Change password end-to-end
8. Analytics filters/query smoke
9. Backend disconnect/reconnect UX
10. Log viewer fetch and refresh behavior

## Rollout

1. ~~Land P0 suite and make it green locally.~~ Done.
2. Add CI job to run P0 on PRs.
3. Expand with phase 2 tests as refactor touchpoints approach those areas.
