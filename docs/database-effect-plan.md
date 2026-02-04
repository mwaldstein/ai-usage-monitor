# Database Effect Safety Plan

Goal: use Effect for DB resource safety, errors, transactions, concurrency. Schema only for row decode.

## Current Gaps
- DB access scattered in routes/services
- Multi-step writes not transactional (reorder, quota+history)
- Errors are untyped; no retry/timeout for busy locks
- Global singleton lifetime; shutdown not structured

## Plan
1. Add `effect` dependency to backend.
2. Create `DatabaseService` tag + Layer:
   - `run/get/all/exec` + `transaction` helpers
   - `Layer.scoped` with `Effect.acquireRelease` open/close
3. Typed DB errors:
   - `DbError` union: `OpenError`, `QueryError`, `BusyError`, `ConstraintError`, `DecodeError`
   - map sqlite error codes -> tags; attach SQL + params (redacted)
4. Transactions:
   - `withTransaction` uses `BEGIN IMMEDIATE` + `COMMIT`/`ROLLBACK`
   - wrap reorder + quota save + history insert
5. Concurrency + retry:
   - serialize writes with `Semaphore`
   - `Effect.retry` on `BusyError` with backoff + jitter
   - `Effect.timeout` on slow queries
6. Observability:
   - `Effect.timed` for query duration logs
   - add trace spans per query
7. Integration:
   - migrate routes/services to Effect DB ops
   - lifecycle uses `Effect.runPromise` + Layer; close on shutdown
8. Tests:
   - in-memory sqlite Layer for unit tests
   - verify transactions + retry behavior

## Unresolved Questions
- none
