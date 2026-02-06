# Database Effect Safety Plan

Goal: use `@effect/sql` with `@effect/sql-sqlite-node` for DB resource safety, errors, transactions, concurrency, and fully typed query boundaries.

## Completed

The core database migration to `@effect/sql` is complete:

- **DB layer**: `@effect/sql-sqlite-node` `SqliteClient`-backed database client with structured lifecycle and shutdown.
- **Typed errors**: `DbError` union (`OpenError`, `QueryError`, `BusyError`, `ConstraintError`, `DecodeError`) with sqlite error-code mapping.
- **Transactions**: native `SqlClient.withTransaction` semantics with busy-lock retry (backoff delays).
- **Migrations**: Effect migrator (`effect_sql_migrations` table) with baseline and legacy reconciliation migrations; startup failure surfaces structured errors and logs applied migration ids/duration.
- **Repository pattern**: all route/service SQL moved to focused query modules under `backend/src/database/queries/`; `SqlSchema.findAll`/`findOne` with request/result schemas for all externally reachable operations.
- **Decode safety**: `ParseError` from `SqlSchema` mapped to `DbError.DecodeError` at repository boundaries.
- **Tests**: in-memory sqlite tests for migrator bootstrapping, transaction rollback, busy-lock retry, decode failures, and legacy migration reconciliation.
- **Legacy cleanup**: removed `sqlite`/`sqlite3` runtime dependencies.

## Remaining: Fully Typed Query Safety

Items not yet started — these represent a future hardening phase:

1. Replace remaining dynamic SQL string assembly with typed statement builders:
   - prefer `sql\`...\`` and composable helpers for predicates (`sql.and`, `sql.or`, `sql.in`)
   - eliminate ad-hoc `SET ${...}` and `WHERE ${...}` construction in repositories
   - note: all queries currently use `sqlClient.unsafe()` — migrating to tagged templates is the main effort
2. Add operation-specific command/query contracts per table:
   - define `SelectRow`, `InsertInput`, `UpdateInput`, and `FilterInput` schemas for each core entity
   - ensure every repository function accepts typed input and returns typed decoded output
3. Introduce branded ID/time scalar schemas:
   - add branded schemas for IDs and time primitives (e.g. `ServiceId`, `UserId`, `UnixSeconds`)
   - prevent cross-entity ID mixups at compile time
4. Restrict and document all `unsafe` statements to audited edge cases only
5. Add negative decode/schema-drift tests (enum drift, nullability mismatch, missing columns, numeric coercion)
6. Add lint + CI enforcement for raw SQL and untyped repository outputs

## Not Implemented (Deferred)

- Write serialization via `Semaphore` — not needed in practice; SQLite WAL mode + busy retry handles contention
- `Effect.timed` / `Effect.timeout` query observability — deferred; OpenTelemetry trace context is injected via pino but per-query spans are not yet wired

## Unresolved Questions
- none
