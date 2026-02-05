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

## Migrations Integration Plan
1. Move schema lifecycle to Effect migrator:
   - add `backend/src/migrations/` with forward-only numbered migration files
   - run `SqliteMigrator.run` during startup before routes are mounted
   - set migrator table explicitly (for example `effect_sql_migrations`)
   - optionally emit schema snapshots via `schemaDirectory`
2. Replace ad-hoc startup DDL/mutation flow:
   - stop executing large startup schema SQL blobs for new migrations once migrator is in place
   - keep bootstrap path only for first-run compatibility, then converge on migrations for all shape changes
3. Migration authoring rules:
   - every schema change must include a migration file and corresponding query/model updates in the same PR
   - use expand/contract for risky changes (add column -> dual-read/write -> backfill -> remove old column later)
   - keep migrations idempotent and deterministic; avoid data-dependent branching when possible
4. Runtime failure policy:
   - if migration run fails, fail startup and surface structured `MigrationError`/`SqlError`
   - log applied migration ids and duration at boot

## Full Query + Row Type Safety Plan
1. Replace generic row casts with schema-decoded query boundaries:
   - use `SqlSchema.findAll` / `findOne` / `single` / `void` for each query module
   - define request schema + result schema for all externally reachable DB operations
2. Standardize query construction:
   - prefer tagged template statements (`sql\`...\``) and combinators (`sql.in`, `sql.and`, `sql.or`, `sql.insert`, `sql.update`)
   - restrict `unsafe` SQL to reviewed edge cases (dynamic identifiers/order clauses)
3. Introduce shared DB models for core tables:
   - define `Model.Class` (or `Schema.Struct`) for `services`, `quotas`, `usage_history`, `users`, `sessions`, `api_keys`
   - use model variants (`select`, `insert`, `update`) to keep row/command contracts aligned
4. Error typing at decode boundaries:
   - map `ParseError` from `SqlSchema` to `DbError` `DecodeError` with operation metadata
   - ensure route/service handlers return consistent API errors on decode failures
5. Data access module shape:
   - move SQL out of routes into focused data modules/repositories
   - export typed functions that accept domain input and return decoded domain rows
6. Safety enforcement:
   - lint/code-review rule: no direct `db.all/get/run` in routes after migration
   - lint/code-review rule: no untyped query result without schema decode

## Progress (Current)
- Added backend `DbError` tags and sqlite error-code mapping for DB open/query failures.
- Added transaction-level busy-lock retry for `BEGIN IMMEDIATE` acquisition.
- Migrated DB lifecycle and route/service call-sites to an `@effect/sql` + `@effect/sql-sqlite-node` `SqliteClient`-backed database layer.
- Migrated multi-step writes to native `SqlClient.withTransaction` semantics while keeping busy-lock retry handling.
- Added startup Effect migrator execution (`effect_sql_migrations`) with initial migration directory scaffolding.
- Migrated startup schema evolution to migrator-managed baseline + legacy reconciliation migrations for pre-migrator databases.
- Removed legacy `sqlite` / `sqlite3` runtime dependencies from the backend.
- Added initial `SqlSchema`-backed service query module with shared request/result schemas and `services` table row decoding.
- Migrated service reads/writes in `routes/services.ts` and service lookup paths in `routes/quotas.ts` to the new query module.
- Added `SqlSchema` query modules + table/request/response schemas for auth (`users`, `sessions`, `api_keys`) and usage/history/analytics query surfaces.
- Migrated remaining DB call-sites (routes, middleware, websocket bootstrap, quota refresh service, lifecycle user-count check) to repository/query modules; direct `db.*` calls now live in query modules only.
- Added shared query runtime error mapping that converts `ParseError` decode failures into `DbError` with `DecodeError` tag at repository boundaries.
- Added backend in-memory sqlite tests for migrator bootstrapping, transaction rollback semantics, busy-lock retry policy, and decode failure behavior.
- Hardened legacy reconciliation migration dedupe step to skip `rowid` logic on `WITHOUT ROWID` tables.

## Remaining Work Checklist
- [x] Add migrator startup path and migration directory structure.
- [x] Convert startup schema/migration logic to migrator-managed workflow.
- [x] Introduce table model schemas and shared request/result schemas for query modules across services/auth/usage surfaces.
- [x] Migrate route-level SQL to repository/query modules using `SqlSchema` APIs.
- [x] Add decode-error mapping (`ParseError` -> `DbError.DecodeError`) at DB boundary.
- [x] Add in-memory sqlite tests for migrations, transactional behavior, retry policy, and decode guarantees.

## Unresolved Questions
- none
