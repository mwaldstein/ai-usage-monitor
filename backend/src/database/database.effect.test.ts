import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import { Schema as S } from "effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { makeDatabaseClient, type DatabaseClient } from "./client.ts";
import { runDatabaseMigrations } from "./migrator.ts";
import { runInTransaction } from "./transactions.ts";
import { DbError } from "./errors.ts";
import { listEnabledServices } from "./queries/services.ts";
import { runDbQueryEffect } from "./queries/runtime.ts";

interface TestDatabaseContext {
  readonly runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>;
  readonly db: DatabaseClient;
}

async function createTestDatabase(): Promise<TestDatabaseContext> {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }));
  const sqlClient = await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, Effect.succeed));
  const db = makeDatabaseClient({ runtime, sqlClient });

  await db.exec("PRAGMA foreign_keys = ON;");
  await runDatabaseMigrations(runtime);

  return { runtime, db };
}

async function createLegacyDatabase(): Promise<TestDatabaseContext> {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }));
  const sqlClient = await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, Effect.succeed));
  const db = makeDatabaseClient({ runtime, sqlClient });

  await db.exec("PRAGMA foreign_keys = ON;");
  await db.exec(`
    CREATE TABLE services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE quotas (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      limit_value REAL NOT NULL,
      used_value REAL NOT NULL,
      remaining_value REAL NOT NULL,
      reset_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE usage_history (
      service_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      value REAL NOT NULL
    );
  `);

  await db.run(
    "INSERT INTO services (id, name, provider, api_key, base_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "svc_legacy",
      "Legacy OpenAI",
      "openai",
      "legacy-key",
      "https://api.openai.com/v1",
      1,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:05:00Z",
    ],
  );

  await db.run(
    "INSERT INTO quotas (id, service_id, metric, limit_value, used_value, remaining_value, reset_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "quota_legacy",
      "svc_legacy",
      "monthly_spend_limit",
      100,
      25,
      75,
      "2026-02-01T00:00:00Z",
      "2026-01-01T00:10:00Z",
      "2026-01-01T00:11:00Z",
    ],
  );

  await db.run(
    "INSERT INTO usage_history (service_id, metric, timestamp, value) VALUES (?, ?, ?, ?)",
    ["svc_legacy", "monthly_spend_limit", "2026-01-01T00:00:00Z", 25],
  );
  await db.run(
    "INSERT INTO usage_history (service_id, metric, timestamp, value) VALUES (?, ?, ?, ?)",
    ["svc_legacy", "monthly_spend_limit", "2026-01-01T00:00:00Z", 25],
  );

  await runDatabaseMigrations(runtime);

  return { runtime, db };
}

test("migrations create baseline tables", async () => {
  const { runtime, db } = await createTestDatabase();
  try {
    const rows = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('services','quotas','usage_history','users','sessions','api_keys','effect_sql_migrations') ORDER BY name",
    );

    assert.deepEqual(
      rows.map((row) => row.name),
      [
        "api_keys",
        "effect_sql_migrations",
        "quotas",
        "services",
        "sessions",
        "usage_history",
        "users",
      ],
    );
  } finally {
    await runtime.dispose();
  }
});

test("transaction rolls back when effect fails", async () => {
  const { runtime, db } = await createTestDatabase();
  try {
    await assert.rejects(
      runInTransaction(db, (txDb) =>
        Effect.gen(function* () {
          yield* txDb.run(
            "INSERT INTO services (id, name, provider, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["svc_tx_1", "Tx Service", "openai", 1, 1, 100, 100],
          );
          return yield* Effect.fail(new Error("force rollback"));
        }),
      ),
    );

    const after = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM services WHERE id = ?",
      ["svc_tx_1"],
    );
    assert.equal(after?.count ?? 0, 0);
  } finally {
    await runtime.dispose();
  }
});

test("busy transaction is retried and succeeds", async () => {
  let attempts = 0;
  const dbLike: Pick<DatabaseClient, "withTransaction"> = {
    async withTransaction<T>(operation: (txDb: never) => Effect.Effect<T, unknown>): Promise<T> {
      attempts += 1;
      if (attempts < 3) {
        throw new DbError("BusyError", "database is busy", {
          cause: new Error("busy"),
          code: "SQLITE_BUSY",
        });
      }

      return Effect.runPromise(operation(undefined as never));
    },
  };

  const value = await runInTransaction(dbLike, () => Effect.succeed("ok"));
  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});

test("parse decode failures map to DbError DecodeError", async () => {
  try {
    await runDbQueryEffect(S.decodeUnknown(S.Number)("not-a-number"));
    assert.fail("expected decode to throw");
  } catch (error) {
    assert.equal(error instanceof DbError, true);
    assert.equal((error as DbError)._tag, "DecodeError");
  }
});

test("repository decode failures bubble as errors", async () => {
  const { runtime, db } = await createTestDatabase();
  try {
    await db.run(
      "INSERT INTO services (id, name, provider, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["svc_bad_provider", "Bad Provider", "not-a-provider", 1, 1, 200, 200],
    );

    await assert.rejects(listEnabledServices(db));

    try {
      await listEnabledServices(db);
      assert.fail("expected listEnabledServices to throw");
    } catch (error) {
      assert.equal(error instanceof Error, true);
    }
  } finally {
    await runtime.dispose();
  }
});

test("legacy schema migrates to current shape and preserves values", async () => {
  const { runtime, db } = await createLegacyDatabase();
  try {
    const serviceColumns = await db.all<{ name: string }>("PRAGMA table_info(services)");
    const quotaColumns = await db.all<{ name: string }>("PRAGMA table_info(quotas)");
    const usageColumns = await db.all<{ name: string }>("PRAGMA table_info(usage_history)");

    assert.equal(
      serviceColumns.some((col) => col.name === "bearer_token"),
      true,
    );
    assert.equal(
      serviceColumns.some((col) => col.name === "display_order"),
      true,
    );
    assert.equal(
      quotaColumns.some((col) => col.name === "raw_limit_value"),
      true,
    );
    assert.equal(
      quotaColumns.some((col) => col.name === "raw_used_value"),
      true,
    );
    assert.equal(
      quotaColumns.some((col) => col.name === "raw_remaining_value"),
      true,
    );
    assert.equal(
      usageColumns.some((col) => col.name === "ts"),
      true,
    );

    const migratedService = await db.get<{
      createdAt: number | string;
      updatedAt: number | string;
    }>("SELECT created_at as createdAt, updated_at as updatedAt FROM services WHERE id = ?", [
      "svc_legacy",
    ]);
    assert.equal(typeof migratedService?.createdAt !== "undefined", true);
    assert.equal(typeof migratedService?.updatedAt !== "undefined", true);
    assert.equal(Number(migratedService?.createdAt) > 0, true);
    assert.equal(Number(migratedService?.updatedAt) > 0, true);

    const migratedQuota = await db.get<{
      rawLimit: number;
      rawUsed: number;
      rawRemaining: number;
      resetAt: number | string | null;
    }>(
      `SELECT
        raw_limit_value as rawLimit,
        raw_used_value as rawUsed,
        raw_remaining_value as rawRemaining,
        reset_at as resetAt
      FROM quotas
      WHERE id = ?`,
      ["quota_legacy"],
    );

    assert.equal(migratedQuota?.rawLimit, 100);
    assert.equal(migratedQuota?.rawUsed, 25);
    assert.equal(migratedQuota?.rawRemaining, 75);
    assert.equal(Number(migratedQuota?.resetAt) > 0, true);

    const dedupedHistory = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM usage_history WHERE service_id = ? AND metric = ?",
      ["svc_legacy", "monthly_spend_limit"],
    );
    assert.equal(dedupedHistory?.count, 1);
  } finally {
    await runtime.dispose();
  }
});
