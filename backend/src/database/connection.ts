import path from "path";
import fs from "fs";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { SCHEMA_SQL, PRAGMA_SQL, applyAdditiveMigrations } from "./schema.ts";
import {
  migrateServicesSchema,
  migrateQuotasSchema,
  migrateUsageHistorySchema,
} from "./migrations.ts";
import { makeDatabaseClient, type DatabaseClient } from "./client.ts";
import { toDbError } from "./errors.ts";
import { logger } from "../utils/logger.ts";
import { getEnv } from "../schemas/env.ts";

let runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown> | null = null;
let db: DatabaseClient | null = null;

function getDataDir(): string {
  const env = getEnv();
  if (env.dataDir) {
    return env.dataDir;
  }

  if (env.nodeEnv === "production") {
    return path.join(process.cwd(), "data");
  }

  const cwdDataPath = path.join(process.cwd(), "data");
  const backendDataPath = path.join(process.cwd(), "backend", "data");

  if (fs.existsSync(backendDataPath)) {
    return backendDataPath;
  }

  return cwdDataPath;
}

export async function initializeDatabase(): Promise<DatabaseClient> {
  if (db) {
    return db;
  }

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

  const nextRuntime = ManagedRuntime.make(SqliteClient.layer({ filename: dbPath }));

  try {
    const sqlClient = await nextRuntime.runPromise(
      Effect.flatMap(SqlClient.SqlClient, Effect.succeed),
    );
    const nextDb = makeDatabaseClient({ runtime: nextRuntime, sqlClient });

    await nextDb.exec(PRAGMA_SQL);

    await migrateUsageHistorySchema(nextDb);
    await migrateServicesSchema(nextDb);
    await migrateQuotasSchema(nextDb);

    await nextDb.exec(SCHEMA_SQL);
    await applyAdditiveMigrations(nextDb);

    runtime = nextRuntime;
    db = nextDb;
  } catch (error) {
    await nextRuntime.dispose().catch(() => {
      // Ignore dispose failures while surfacing initialization error.
    });
    throw toDbError(error, { operation: "open" });
  }

  logger.info({ dbPath }, "Database initialized successfully");

  return db;
}

export function getDatabase(): DatabaseClient {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (runtime) {
    await runtime.dispose();
    runtime = null;
  }

  db = null;
}
