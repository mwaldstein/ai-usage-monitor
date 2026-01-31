import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

let db: Database<sqlite3.Database> | null = null;

export async function initializeDatabase(): Promise<Database<sqlite3.Database>> {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "data", "ai-usage.db");

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable WAL mode for better concurrency and configure auto_vacuum
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA auto_vacuum = INCREMENTAL;
  `);

  // Run schema migrations BEFORE creating tables (for existing databases)
  await migrateUsageHistorySchema(db);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT,
      bearer_token TEXT,
      base_url TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      reset_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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
  `);

  // Migration: Add bearer_token column to existing databases (if it doesn't exist)
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN bearer_token TEXT;`);
    console.log("[Database] Migration: Added bearer_token column to services table");
  } catch {}

  // Migrations: Add quota metadata columns (if they don't exist)
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN type TEXT;`);
    console.log("[Database] Migration: Added type column to quotas table");
  } catch {}
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_amount REAL;`);
    console.log("[Database] Migration: Added replenishment_amount column to quotas table");
  } catch {}
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_period TEXT;`);
    console.log("[Database] Migration: Added replenishment_period column to quotas table");
  } catch {}

  // Migration: Add display_order column to existing databases (if it doesn't exist)
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN display_order INTEGER DEFAULT 0;`);
    console.log("[Database] Migration: Added display_order column to services table");
  } catch {}

  return db;
}

async function migrateUsageHistorySchema(db: Database<sqlite3.Database>): Promise<void> {
  // Check if old schema exists (has 'id' column and 'timestamp' column)
  const tableInfo = await db.all(`PRAGMA table_info(usage_history)`);
  const hasIdColumn = tableInfo.some((col: { name: string }) => col.name === "id");
  const hasTimestampColumn = tableInfo.some((col: { name: string }) => col.name === "timestamp");

  if (!hasIdColumn || !hasTimestampColumn) {
    // Already on new schema or fresh install
    return;
  }

  console.log(
    "[Database] Migration: Converting usage_history to new schema (composite PK, INTEGER ts)...",
  );

  try {
    await db.exec(`
      -- Create new table with optimized schema
      CREATE TABLE IF NOT EXISTS usage_history_new (
        service_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        ts INTEGER NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (service_id, metric, ts),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      ) WITHOUT ROWID;

      -- Migrate data, converting ISO timestamp to unix epoch
      -- Use INSERT OR REPLACE to handle potential duplicates (same service+metric+second)
      INSERT OR REPLACE INTO usage_history_new (service_id, metric, ts, value)
      SELECT service_id, metric, CAST(strftime('%s', timestamp) AS INTEGER), value
      FROM usage_history;

      -- Drop old table and rename new one
      DROP TABLE usage_history;
      ALTER TABLE usage_history_new RENAME TO usage_history;

      -- Recreate index on ts
      CREATE INDEX IF NOT EXISTS idx_usage_history_ts ON usage_history(ts);
    `);

    console.log("[Database] Migration: usage_history schema migration complete");
  } catch (error) {
    console.error("[Database] Migration failed:", error);
    throw error;
  }
}

export function getDatabase(): Database<sqlite3.Database> {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export async function runMaintenance(): Promise<void> {
  if (!db) return;

  try {
    // Checkpoint WAL to merge it into the main database file
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);

    // Run incremental vacuum to reclaim space from deleted rows
    await db.exec(`PRAGMA incremental_vacuum;`);

    console.log("[Database] Maintenance complete: WAL checkpoint and incremental vacuum");
  } catch (error) {
    console.error("[Database] Maintenance failed:", error);
  }
}
