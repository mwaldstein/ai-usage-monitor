import * as Migrator from "@effect/sql/Migrator";
import type * as SqlClient from "@effect/sql/SqlClient";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { DB_MIGRATIONS } from "../migrations/index.ts";
import { logger } from "../utils/logger.ts";

const MIGRATIONS_TABLE = "effect_sql_migrations";

const migrationProgram = Migrator.make({})({
  loader: Migrator.fromRecord(DB_MIGRATIONS),
  table: MIGRATIONS_TABLE,
});

export async function runDatabaseMigrations(
  runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>,
): Promise<void> {
  const start = Date.now();
  const appliedMigrations = await runtime.runPromise(migrationProgram);

  logger.info(
    {
      migrationsTable: MIGRATIONS_TABLE,
      appliedMigrations,
      durationMs: Date.now() - start,
    },
    "Database migrations completed",
  );
}
