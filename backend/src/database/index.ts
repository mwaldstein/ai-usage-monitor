import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database<sqlite3.Database> | null = null;

export async function initializeDatabase(): Promise<Database<sqlite3.Database>> {
  if (db) return db;

  const dbPath = path.join(process.cwd(), 'data', 'ai-usage.db');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

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
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quotas_service ON quotas(service_id);
    CREATE INDEX IF NOT EXISTS idx_usage_history_service ON usage_history(service_id);
    CREATE INDEX IF NOT EXISTS idx_usage_history_timestamp ON usage_history(timestamp);
  `);

  // Migration: Add bearer_token column to existing databases (if it doesn't exist)
  try {
    await db.exec(`ALTER TABLE services ADD COLUMN bearer_token TEXT;`);
    console.log('[Database] Migration: Added bearer_token column to services table');
  } catch (error) {
    // Column likely already exists, ignore error
  }

  // Migrations: Add quota metadata columns (if they don't exist)
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN type TEXT;`);
    console.log('[Database] Migration: Added type column to quotas table');
  } catch (error) {
    // ignore
  }
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_amount REAL;`);
    console.log('[Database] Migration: Added replenishment_amount column to quotas table');
  } catch (error) {
    // ignore
  }
  try {
    await db.exec(`ALTER TABLE quotas ADD COLUMN replenishment_period TEXT;`);
    console.log('[Database] Migration: Added replenishment_period column to quotas table');
  } catch (error) {
    // ignore
  }

  return db;
}

export function getDatabase(): Database<sqlite3.Database> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}
