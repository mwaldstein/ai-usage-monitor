import type * as Effect from "effect/Effect";
import type * as SqlClient from "@effect/sql/SqlClient";
import baselineSchemaMigration from "./0001_baseline_schema.ts";
import legacyReconcileMigration from "./0002_legacy_reconcile.ts";
import serviceHealthStatusMigration from "./0003_service_health_status.ts";

export const DB_MIGRATIONS: Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>> = {
  "0001_baseline_schema": baselineSchemaMigration,
  "0002_legacy_reconcile": legacyReconcileMigration,
  "0003_service_health_status": serviceHealthStatusMigration,
};
