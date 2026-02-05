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
