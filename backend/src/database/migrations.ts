import type { DatabaseClient } from "./client.ts";
import { logger } from "../utils/logger.ts";

export async function migrateServicesSchema(db: DatabaseClient): Promise<void> {
  const tableInfo = await db.all<{ name: string; type: string }>(`PRAGMA table_info(services)`);
  if (tableInfo.length === 0) return;

  const createdAtCol = tableInfo.find(
    (col: { name: string; type: string }) => col.name === "created_at",
  );
  if (!createdAtCol || createdAtCol.type === "INTEGER") return;

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

export async function migrateQuotasSchema(db: DatabaseClient): Promise<void> {
  const tableInfo = await db.all<{ name: string; type: string }>(`PRAGMA table_info(quotas)`);
  if (tableInfo.length === 0) return;

  const createdAtCol = tableInfo.find(
    (col: { name: string; type: string }) => col.name === "created_at",
  );
  if (!createdAtCol || createdAtCol.type === "INTEGER") return;

  logger.info("[Database] Migration: Converting quotas timestamps to INTEGER...");

  try {
    await db.exec(`
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
      );

      INSERT INTO quotas_new (id, service_id, metric, raw_limit_value, raw_used_value, raw_remaining_value, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at)
      SELECT id, service_id, metric, limit_value, used_value, remaining_value, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period,
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

export async function migrateUsageHistorySchema(db: DatabaseClient): Promise<void> {
  const tableInfo = await db.all<{ name: string }>(`PRAGMA table_info(usage_history)`);
  const hasIdColumn = tableInfo.some((col: { name: string }) => col.name === "id");
  const hasTimestampColumn = tableInfo.some((col: { name: string }) => col.name === "timestamp");

  if (!hasIdColumn || !hasTimestampColumn) {
    return;
  }

  logger.info(
    "[Database] Migration: Converting usage_history to new schema (composite PK, INTEGER ts)...",
  );

  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS usage_history_new (
        service_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        ts INTEGER NOT NULL,
        value REAL NOT NULL,
        PRIMARY KEY (service_id, metric, ts),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      ) WITHOUT ROWID;

      INSERT OR REPLACE INTO usage_history_new (service_id, metric, ts, value)
      SELECT service_id, metric, CAST(strftime('%s', timestamp) AS INTEGER), value
      FROM usage_history;

      DROP TABLE usage_history;
      ALTER TABLE usage_history_new RENAME TO usage_history;

      CREATE INDEX IF NOT EXISTS idx_usage_history_ts ON usage_history(ts);
    `);

    logger.info("[Database] Migration: usage_history schema migration complete");
  } catch (error) {
    logger.error({ err: error }, "[Database] Migration failed");
    throw error;
  }
}
