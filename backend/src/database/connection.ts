import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import { SCHEMA_SQL, PRAGMA_SQL, applyAdditiveMigrations } from "./schema.ts";
import {
  migrateServicesSchema,
  migrateQuotasSchema,
  migrateUsageHistorySchema,
} from "./migrations.ts";

let db: Database<sqlite3.Database> | null = null;

export async function initializeDatabase(): Promise<Database<sqlite3.Database>> {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "data", "ai-usage.db");

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(PRAGMA_SQL);

  // Run migrations before creating tables
  await migrateUsageHistorySchema(db);
  await migrateServicesSchema(db);
  await migrateQuotasSchema(db);

  await db.exec(SCHEMA_SQL);

  // Apply additive migrations for columns added after initial schema
  await applyAdditiveMigrations(db);

  return db;
}

export function getDatabase(): Database<sqlite3.Database> {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
