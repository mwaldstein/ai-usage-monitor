import type { Database } from "sqlite";
import type sqlite3 from "sqlite3";

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_key TEXT,
    bearer_token TEXT,
    base_url TEXT,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotas (
    id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    metric TEXT NOT NULL,
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
  );

  CREATE TABLE IF NOT EXISTS usage_history (
    service_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    ts INTEGER NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (service_id, metric, ts),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
  ) WITHOUT ROWID;

  CREATE INDEX IF NOT EXISTS idx_quotas_service ON quotas(service_id);
  CREATE INDEX IF NOT EXISTS idx_usage_history_ts ON usage_history(ts);
`;

export const PRAGMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA auto_vacuum = INCREMENTAL;
`;

export const ADDITIVE_MIGRATIONS: Array<{ column: string; table: string; type: string }> = [
  { column: "bearer_token", table: "services", type: "TEXT" },
  { column: "type", table: "quotas", type: "TEXT" },
  { column: "replenishment_amount", table: "quotas", type: "REAL" },
  { column: "replenishment_period", table: "quotas", type: "TEXT" },
  { column: "display_order", table: "services", type: "INTEGER DEFAULT 0" },
];

export async function applyAdditiveMigrations(db: Database<sqlite3.Database>): Promise<void> {
  for (const { column, table, type } of ADDITIVE_MIGRATIONS) {
    try {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    } catch {
      // Column already exists or other error - ignore
    }
  }
}
