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
import { toDbError } from "./errors.ts";
import { logger } from "../utils/logger.ts";
import { getEnv } from "../schemas/env.ts";

let db: Database<sqlite3.Database> | null = null;

function getDataDir(): string {
  const env = getEnv();
  // Explicit DATA_DIR takes precedence
  if (env.dataDir) {
    return env.dataDir;
  }

  // In production (Docker), use /app/data
  if (env.nodeEnv === "production") {
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
  const env = getEnv();

  logger.info(
    {
      dataDir,
      dbPath,
      dbExists,
      cwd: process.cwd(),
      NODE_ENV: env.nodeEnv,
      DATA_DIR: env.dataDir,
    },
    "Initializing database",
  );

  fs.mkdirSync(dataDir, { recursive: true });

  let openedDb: Database<sqlite3.Database> | null = null;

  try {
    openedDb = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await openedDb.exec(PRAGMA_SQL);

    // Run migrations before creating tables
    await migrateUsageHistorySchema(openedDb);
    await migrateServicesSchema(openedDb);
    await migrateQuotasSchema(openedDb);

    await openedDb.exec(SCHEMA_SQL);

    // Apply additive migrations for columns added after initial schema
    await applyAdditiveMigrations(openedDb);
  } catch (error) {
    if (openedDb) {
      await openedDb.close().catch(() => {
        // Ignore close failures while surfacing initialization error.
      });
      throw toDbError(error, { operation: "query" });
    }

    throw toDbError(error, { operation: "open" });
  }

  if (!openedDb) {
    throw toDbError(new Error("Database initialization completed without a connection"), {
      operation: "open",
    });
  }

  db = openedDb;

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
