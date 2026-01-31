import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import { logger } from "../utils/logger.ts";

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
  await migrateServicesSchema(db);
  await migrateQuotasSchema(db);

  await db.exec(`
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
  `);

  // Migration: Add bearer_token column to existing databases (if it doesn't exist)
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN bearer_token TEXT;`);
    logger.info("[Database] Migration: Added bearer_token column to services table");
  } catch {}

  // Migrations: Add quota metadata columns (if they don't exist)
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN type TEXT;`);
    logger.info("[Database] Migration: Added type column to quotas table");
  } catch {}
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_amount REAL;`);
    logger.info("[Database] Migration: Added replenishment_amount column to quotas table");
  } catch {}
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_period TEXT;`);
    logger.info("[Database] Migration: Added replenishment_period column to quotas table");
  } catch {}

  // Migration: Add display_order column to existing databases (if it doesn't exist)
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN display_order INTEGER DEFAULT 0;`);
    logger.info("[Database] Migration: Added display_order column to services table");
  } catch {}

  return db;
}

async function migrateServicesSchema(db: Database<sqlite3.Database>): Promise<void> {
  // Check if services table exists and has TEXT timestamps
  const tableInfo = await db.all(`PRAGMA table_info(services)`);
  if (tableInfo.length === 0) return; // Table doesn't exist yet

  const createdAtCol = tableInfo.find(
    (col: { name: string; type: string }) => col.name === "created_at",
  );
  if (!createdAtCol || createdAtCol.type === "INTEGER") return; // Already migrated or new schema

  logger.info("[Database] Migration: Converting services timestamps to INTEGER...");

  try {
    await db.exec(`
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
      );

      INSERT INTO services_new (id, name, provider, api_key, bearer_token, base_url, enabled, display_order, created_at, updated_at)
      SELECT id, name, provider, api_key, bearer_token, base_url, enabled, COALESCE(display_order, 0),
             CAST(strftime('%s', created_at) AS INTEGER),
             CAST(strftime('%s', updated_at) AS INTEGER)
      FROM services;

      DROP TABLE services;
      ALTER TABLE services_new RENAME TO services;
    `);
    logger.info("[Database] Migration: services timestamps converted to INTEGER");
  } catch (error) {
    logger.error({ err: error }, "[Database] Migration failed");
    throw error;
  }
}

async function migrateQuotasSchema(db: Database<sqlite3.Database>): Promise<void> {
  // Check if quotas table exists and has TEXT timestamps
  const tableInfo = await db.all(`PRAGMA table_info(quotas)`);
  if (tableInfo.length === 0) return; // Table doesn't exist yet

  const createdAtCol = tableInfo.find(
    (col: { name: string; type: string }) => col.name === "created_at",
  );
  if (!createdAtCol || createdAtCol.type === "INTEGER") return; // Already migrated or new schema

  logger.info("[Database] Migration: Converting quotas timestamps to INTEGER...");

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS quotas_new (
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

      INSERT INTO quotas_new (id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at)
      SELECT id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period,
             CASE WHEN reset_at IS NOT NULL THEN CAST(strftime('%s', reset_at) AS INTEGER) ELSE NULL END,
             CAST(strftime('%s', created_at) AS INTEGER),
             CAST(strftime('%s', updated_at) AS INTEGER)
      FROM quotas;

      DROP TABLE quotas;
      ALTER TABLE quotas_new RENAME TO quotas;

      CREATE INDEX IF NOT EXISTS idx_quotas_service ON quotas(service_id);
    `);
    logger.info("[Database] Migration: quotas timestamps converted to INTEGER");
  } catch (error) {
    logger.error({ err: error }, "[Database] Migration failed");
    throw error;
  }
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

  logger.info(
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

    logger.info("[Database] Migration: usage_history schema migration complete");
  } catch (error) {
    logger.error({ err: error }, "[Database] Migration failed");
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

    logger.info("[Database] Maintenance complete: WAL checkpoint and incremental vacuum");
  } catch (error) {
    logger.error({ err: error }, "[Database] Maintenance failed");
  }
}
