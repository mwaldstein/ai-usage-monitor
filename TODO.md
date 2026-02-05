# TODO

> Remove items when finished. Do not use checkmarks or strikeout.

## Technical Debt / Refactoring

### Backend
- Store raw quota values in DB; translate to burn-down/derived views in API (may require migration or old/new record handling)

## Testing

- **End-to-end tests**: Add e2e test suite covering critical user flows
  - Auth flow: setup code entry, first-user registration, login, logout, session expiry
  - API key lifecycle: create, use for API/CLI access, delete
  - Service management: add, edit, reorder, delete services
  - Quota refresh: manual refresh triggers update and WebSocket broadcast
  - WebSocket: authenticated connection, unauthenticated rejection, reconnection after token expiry
  - CLI: `--token` flag authenticates and returns cached status

## Features

- **Quota-reset aware refresh**: Track quota floor (lowest point reached) to enable strategic refresh timing shortly before reset
- **History pruning**: Implement intelligent data retention that maintains quota-refresh awareness for long-term usage trends while pruning full granularity
