import * as Effect from "effect/Effect";
import * as SqlClient from "@effect/sql/SqlClient";

interface TableInfoRow {
  readonly name: string;
  readonly type: string;
}

const legacyReconcileMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const servicesTableInfo = yield* tableInfo(sql, "services");
  const quotasTableInfo = yield* tableInfo(sql, "quotas");
  const usageHistoryTableInfo = yield* tableInfo(sql, "usage_history");

  yield* addColumnIfMissing(sql, "services", "bearer_token", "TEXT");
  yield* addColumnIfMissing(sql, "services", "display_order", "INTEGER DEFAULT 0");

  if (
    hasColumn(servicesTableInfo, "created_at") &&
    !isIntegerColumn(servicesTableInfo, "created_at")
  ) {
    yield* sql.unsafe(
      `UPDATE services
       SET created_at = CAST(strftime('%s', created_at) AS INTEGER)
       WHERE created_at IS NOT NULL`,
    );
  }

  if (
    hasColumn(servicesTableInfo, "updated_at") &&
    !isIntegerColumn(servicesTableInfo, "updated_at")
  ) {
    yield* sql.unsafe(
      `UPDATE services
       SET updated_at = CAST(strftime('%s', updated_at) AS INTEGER)
       WHERE updated_at IS NOT NULL`,
    );
  }

  yield* addColumnIfMissing(sql, "quotas", "type", "TEXT");
  yield* addColumnIfMissing(sql, "quotas", "replenishment_amount", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "replenishment_period", "TEXT");
  yield* addColumnIfMissing(sql, "quotas", "raw_limit_value", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "raw_used_value", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "raw_remaining_value", "REAL");

  if (hasColumn(quotasTableInfo, "created_at") && !isIntegerColumn(quotasTableInfo, "created_at")) {
    yield* sql.unsafe(
      `UPDATE quotas
       SET created_at = CAST(strftime('%s', created_at) AS INTEGER)
       WHERE created_at IS NOT NULL`,
    );
  }

  if (hasColumn(quotasTableInfo, "updated_at") && !isIntegerColumn(quotasTableInfo, "updated_at")) {
    yield* sql.unsafe(
      `UPDATE quotas
       SET updated_at = CAST(strftime('%s', updated_at) AS INTEGER)
       WHERE updated_at IS NOT NULL`,
    );
  }

  if (hasColumn(quotasTableInfo, "reset_at") && !isIntegerColumn(quotasTableInfo, "reset_at")) {
    yield* sql.unsafe(
      `UPDATE quotas
       SET reset_at = CASE
         WHEN reset_at IS NULL THEN NULL
         ELSE CAST(strftime('%s', reset_at) AS INTEGER)
       END`,
    );
  }

  yield* sql.unsafe(
    `UPDATE quotas
     SET raw_limit_value = COALESCE(raw_limit_value, limit_value),
         raw_used_value = COALESCE(raw_used_value, used_value),
         raw_remaining_value = COALESCE(raw_remaining_value, remaining_value)`,
  );

  if (hasColumn(usageHistoryTableInfo, "timestamp") && !hasColumn(usageHistoryTableInfo, "ts")) {
    yield* addColumnIfMissing(sql, "usage_history", "ts", "INTEGER");
    yield* sql.unsafe(
      `UPDATE usage_history
       SET ts = CAST(strftime('%s', timestamp) AS INTEGER)
       WHERE ts IS NULL AND timestamp IS NOT NULL`,
    );
  }

  if (
    hasColumn(usageHistoryTableInfo, "ts") ||
    (hasColumn(usageHistoryTableInfo, "timestamp") && !hasColumn(usageHistoryTableInfo, "ts"))
  ) {
    yield* sql.unsafe(
      `DELETE FROM usage_history
       WHERE rowid NOT IN (
         SELECT MAX(rowid)
         FROM usage_history
         GROUP BY service_id, metric, ts
       )`,
    );
  }

  yield* sql.unsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_history_composite ON usage_history(service_id, metric, ts)",
  );
  yield* sql.unsafe("CREATE INDEX IF NOT EXISTS idx_quotas_service ON quotas(service_id)");
  yield* sql.unsafe("CREATE INDEX IF NOT EXISTS idx_usage_history_ts ON usage_history(ts)");
});

function tableInfo(
  sql: SqlClient.SqlClient,
  tableName: "services" | "quotas" | "usage_history",
): Effect.Effect<ReadonlyArray<TableInfoRow>, unknown> {
  return sql.unsafe<TableInfoRow>(`PRAGMA table_info(${tableName})`);
}

function addColumnIfMissing(
  sql: SqlClient.SqlClient,
  tableName: string,
  columnName: string,
  columnType: string,
): Effect.Effect<void, never> {
  return Effect.asVoid(
    Effect.catchAll(
      sql.unsafe(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`),
      () => Effect.void,
    ),
  );
}

function hasColumn(tableInfo: ReadonlyArray<TableInfoRow>, columnName: string): boolean {
  return tableInfo.some((col) => col.name === columnName);
}

function isIntegerColumn(tableInfo: ReadonlyArray<TableInfoRow>, columnName: string): boolean {
  const column = tableInfo.find((col) => col.name === columnName);
  return column?.type === "INTEGER";
}

export default legacyReconcileMigration;
