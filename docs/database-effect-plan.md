# Database Effect Safety Plan

Goal: use `@effect/sql` with `@effect/sql-sqlite-node` for DB resource safety, errors, transactions, concurrency. Schema only for row decode.

## Current Gaps
- DB access scattered in routes/services
- Multi-step writes not transactional (reorder, quota+history)
- Errors are untyped; no retry/timeout for busy locks
- Global singleton lifetime; shutdown not structured

## Plan
1. Add/align SQL dependencies in backend:
   - `@effect/sql`
   - `@effect/sql-sqlite-node`
   - ensure compatible versions of `effect`, `@effect/platform`, and `@effect/experimental`
2. Create DB Layer from `SqliteClient`:
   - initialize via `SqliteClient` layer/config
   - provide app-level DB service helpers on top of `SqlClient` where needed
3. Typed DB errors:
   - `DbError` union: `OpenError`, `QueryError`, `BusyError`, `ConstraintError`, `DecodeError`
   - map sqlite / sql-client errors -> tags; attach SQL + params (redacted)
4. Transactions:
   - use `@effect/sql` transaction APIs (SQLite `BEGIN IMMEDIATE` semantics where applicable)
   - wrap reorder + quota save + history insert
5. Concurrency + retry:
   - serialize writes with `Semaphore`
   - `Effect.retry` on `BusyError` with backoff + jitter
   - `Effect.timeout` on slow queries
6. Observability:
   - `Effect.timed` for query duration logs
   - add trace spans per query
7. Integration:
   - migrate routes/services to `SqlClient`-backed Effect DB ops
   - lifecycle uses `Effect.runPromise` + Layer; close on shutdown
8. Tests:
   - in-memory sqlite Layer for unit tests
   - verify transactions + retry behavior

## Progress (Current)
- Added backend `DbError` tags and sqlite error-code mapping for DB open/query failures.
- Added transaction-level busy-lock retry for `BEGIN IMMEDIATE` acquisition.
- Remaining: migrate to `@effect/sql` `SqliteClient` layer and convert route/service call-sites.

## Unresolved Questions
- none
