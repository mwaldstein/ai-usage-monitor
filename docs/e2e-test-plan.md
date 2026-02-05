# E2E Test Plan

## Goal

Add a focused, high-value end-to-end test suite that protects critical user workflows while backend and frontend refactors continue.

This plan intentionally prioritizes confidence over exhaustiveness.

## Current Coverage Snapshot

- Existing automated tests are backend/shared unit-effect focused (`node:test`) and schema-contract focused.
- There is no existing browser e2e harness (no Playwright/Cypress setup) and no CI e2e gate today.

## Critical Flows to Protect

1. First-run setup and authentication lifecycle
2. Service management (add, reorder, delete)
3. Quota refresh pipeline and persisted dashboard updates
4. WebSocket-connected dashboard health state
5. Analytics query/filters wiring (smoke)

## Prioritized E2E Cases

### Phase 1 (P0, implement first)

1. **First-run setup and registration**
   - Preconditions: Empty DB (no users)
   - Steps: Open app, verify setup form, submit invalid setup code, submit valid setup code
   - Assertions: Invalid attempt shows error; valid attempt logs in and shows dashboard shell

2. **Login, logout, and session restore**
   - Preconditions: Existing user
   - Steps: Failed login, successful login, page reload, logout
   - Assertions: Failed login error appears; reload remains authenticated; logout returns to sign-in screen

3. **Add service and render dashboard card**
   - Preconditions: Authenticated user, deterministic mock provider endpoint
   - Steps: Open settings, add OpenAI service with mock base URL
   - Assertions: Service appears in settings list and dashboard card list

4. **Refresh-all updates usage data**
   - Preconditions: Service configured against controllable mock provider
   - Steps: Set mock usage payload A, refresh-all; set payload B, refresh-all
   - Assertions: Dashboard quota value and "Updated" footer timestamp both change

5. **Service reorder persists after reload**
   - Preconditions: At least two configured services
   - Steps: Reorder service in settings, reload
   - Assertions: New order persists in settings and dashboard

### Phase 2 (P1/P2, add next)

6. Delete service confirmation flow (cancel vs confirm)
7. Change password end-to-end
8. Analytics filters/query smoke
9. Backend disconnect/reconnect UX
10. Log viewer fetch and refresh behavior

## Test Architecture Decisions

- **Framework**: Playwright (`@playwright/test`)
- **Environment orchestration**:
  - Frontend dev server on `:3000`
  - Backend server on `:3001`
  - Local mock provider server for deterministic quota responses
- **State isolation**:
  - Dedicated test `DATA_DIR` per run
  - Test data seeding via public auth/service APIs where possible
- **Stability strategy**:
  - Use deterministic mock provider, never real third-party APIs
  - Use eventual assertions over fixed sleeps for async refresh/WS updates
  - Add stable `data-testid` selectors for icon-only controls and modal form fields

## Known Constraints and Mitigations

1. **Setup code is only printed to backend logs and one-time in-memory**
   - Mitigation: Capture backend stdout in test harness and extract setup code for first-run scenario.

2. **Provider network/API variability causes flakiness**
   - Mitigation: Use local mock provider server and service `baseUrl` override.

3. **WebSocket reconnect and refresh are asynchronous**
   - Mitigation: Retry-based assertions and explicit UI-state waits.

4. **Locale/time formatting can vary**
   - Mitigation: Assert change/presence rather than exact time strings.

## Rollout

1. Land P0 suite and make it green locally.
2. Add CI job to run P0 on PRs.
3. Expand with phase 2 tests as refactor touchpoints approach those areas.
