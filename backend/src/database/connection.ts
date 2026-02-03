import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";
import fs from "fs";
import { SCHEMA_SQL, PRAGMA_SQL, applyAdditiveMigrations } from "./schema.ts";
import {
  migrateServicesSchema,
  migrateQuotasSchema,
  migrateUsageHistorySchema,
} from "./migrations.ts";
import { logger } from "../utils/logger.ts";

let db: Database<sqlite3.Database> | null = null;

function getDataDir(): string {
  // Explicit DATA_DIR takes precedence
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }

  // In production (Docker), use /app/data
  if (process.env.NODE_ENV === "production") {
    return path.join(process.cwd(), "data");
  }

  // In development, use backend/data relative to repo root
  // Check if we're in the backend directory or repo root
  const cwdDataPath = path.join(process.cwd(), "data");
  const backendDataPath = path.join(process.cwd(), "backend", "data");

  if (fs.existsSync(backendDataPath)) {
    return backendDataPath;
  }

  return cwdDataPath;
}

export async function initializeDatabase(): Promise<Database<sqlite3.Database>> {
  if (db) return db;

  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, "ai-usage.db");
  const dbExists = fs.existsSync(dbPath);

  logger.info(
    {
      dataDir,
      dbPath,
      dbExists,
      cwd: process.cwd(),
      NODE_ENV: process.env.NODE_ENV,
      DATA_DIR: process.env.DATA_DIR,
    },
    "Initializing database",
  );

  fs.mkdirSync(dataDir, { recursive: true });

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

  logger.info({ dbPath }, "Database initialized successfully");

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
