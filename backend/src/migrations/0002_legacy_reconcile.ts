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

  if (servicesTableInfo.length > 0) {
    const createdAtCol = servicesTableInfo.find((col) => col.name === "created_at");
    if (createdAtCol && createdAtCol.type !== "INTEGER") {
      yield* recreateLegacyServicesTable(sql);
    }
  }

  if (quotasTableInfo.length > 0) {
    const createdAtCol = quotasTableInfo.find((col) => col.name === "created_at");
    if (createdAtCol && createdAtCol.type !== "INTEGER") {
      yield* recreateLegacyQuotasTable(sql);
    }
  }

  const hasLegacyUsageHistoryColumns =
    usageHistoryTableInfo.some((col) => col.name === "id") &&
    usageHistoryTableInfo.some((col) => col.name === "timestamp");

  if (hasLegacyUsageHistoryColumns) {
    yield* recreateLegacyUsageHistoryTable(sql);
  }

  yield* addColumnIfMissing(sql, "services", "bearer_token", "TEXT");
  yield* addColumnIfMissing(sql, "services", "display_order", "INTEGER DEFAULT 0");

  yield* addColumnIfMissing(sql, "quotas", "type", "TEXT");
  yield* addColumnIfMissing(sql, "quotas", "replenishment_amount", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "replenishment_period", "TEXT");
  yield* addColumnIfMissing(sql, "quotas", "raw_limit_value", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "raw_used_value", "REAL");
  yield* addColumnIfMissing(sql, "quotas", "raw_remaining_value", "REAL");

  yield* sql.unsafe(
    `UPDATE quotas
     SET raw_limit_value = COALESCE(raw_limit_value, limit_value),
         raw_used_value = COALESCE(raw_used_value, used_value),
         raw_remaining_value = COALESCE(raw_remaining_value, remaining_value)`,
  );

  yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_quotas_service ON quotas(service_id)`);
  yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_usage_history_ts ON usage_history(ts)`);
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

function recreateLegacyServicesTable(sql: SqlClient.SqlClient): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS services_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT,
        bearer_token TEXT,
        base_url TEXT,
        enabled INTEGER DEFAULT 1,
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    yield* sql.unsafe(`
      INSERT INTO services_new (id, name, provider, api_key, bearer_token, base_url, enabled, display_order, created_at, updated_at)
      SELECT id, name, provider, api_key, bearer_token, base_url, enabled, COALESCE(display_order, 0),
             CAST(strftime('%s', created_at) AS INTEGER),
             CAST(strftime('%s', updated_at) AS INTEGER)
      FROM services
    `);

    yield* sql.unsafe(`DROP TABLE services`);
    yield* sql.unsafe(`ALTER TABLE services_new RENAME TO services`);
  });
}

function recreateLegacyQuotasTable(sql: SqlClient.SqlClient): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS quotas_new (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        raw_limit_value REAL,
        raw_used_value REAL,
        raw_remaining_value REAL,
        limit_value REAL NOT NULL,
        used_value REAL NOT NULL,
        remaining_value REAL NOT NULL,
        type TEXT,
        replenishment_amount REAL,
        replenishment_period TEXT,
        reset_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      )
    `);

    yield* sql.unsafe(`
      INSERT INTO quotas_new (id, service_id, metric, raw_limit_value, raw_used_value, raw_remaining_value, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at)
      SELECT id, service_id, metric, limit_value, used_value, remaining_value, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period,
             CASE WHEN reset_at IS NOT NULL THEN CAST(strftime('%s', reset_at) AS INTEGER) ELSE NULL END,
             CAST(strftime('%s', created_at) AS INTEGER),
             CAST(strftime('%s', updated_at) AS INTEGER)
      FROM quotas
    `);

    yield* sql.unsafe(`DROP TABLE quotas`);
    yield* sql.unsafe(`ALTER TABLE quotas_new RENAME TO quotas`);
  });
}

function recreateLegacyUsageHistoryTable(sql: SqlClient.SqlClient): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* sql.unsafe(`
      CREATE TABLE IF NOT EXISTS usage_history_new (
        service_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        ts INTEGER NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (service_id, metric, ts),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      ) WITHOUT ROWID
    `);

    yield* sql.unsafe(`
      INSERT OR REPLACE INTO usage_history_new (service_id, metric, ts, value)
      SELECT service_id, metric, CAST(strftime('%s', timestamp) AS INTEGER), value
      FROM usage_history
    `);

    yield* sql.unsafe(`DROP TABLE usage_history`);
    yield* sql.unsafe(`ALTER TABLE usage_history_new RENAME TO usage_history`);
  });
}

export default legacyReconcileMigration;
