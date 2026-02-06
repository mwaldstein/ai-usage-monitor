import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { makeDatabaseClient, type DatabaseClient } from "../../database/client.ts";
import { runDatabaseMigrations } from "../../database/migrator.ts";
import { listLatestQuotasForEnabledServices } from "../../database/queries/usage.ts";
import { saveQuotasToDb } from "./persistence.ts";
import type { AIService, UsageQuota } from "../../types/index.ts";

interface TestContext {
  readonly runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>;
  readonly db: DatabaseClient;
}

async function setup(): Promise<TestContext> {
  const runtime = ManagedRuntime.make(SqliteClient.layer({ filename: ":memory:" }));
  const sqlClient = await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, Effect.succeed));
  const db = makeDatabaseClient({ runtime, sqlClient });
  await db.exec("PRAGMA foreign_keys = ON;");
  await runDatabaseMigrations(runtime);
  return { runtime, db };
}

const SERVICE: AIService = {
  id: "svc_amp",
  name: "AMP",
  provider: "amp",
  enabled: true,
  displayOrder: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

function makeQuota(overrides: Partial<UsageQuota> & { id: string; metric: string }): UsageQuota {
  return {
    serviceId: SERVICE.id,
    limit: 20,
    used: 5,
    remaining: 15,
    resetAt: 9999,
    createdAt: 1000,
    updatedAt: 1000,
    type: "usage",
    ...overrides,
  };
}

async function insertService(db: DatabaseClient): Promise<void> {
  await db.run(
    "INSERT INTO services (id, name, provider, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      SERVICE.id,
      SERVICE.name,
      SERVICE.provider,
      1,
      SERVICE.displayOrder,
      SERVICE.createdAt,
      SERVICE.updatedAt,
    ],
  );
}

test("disappeared metric is zeroed out on next save", async () => {
  const { runtime, db } = await setup();
  try {
    await insertService(db);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q1", metric: "ubi_quota", used: 5, limit: 20, remaining: 15 }),
      makeQuota({
        id: "q2",
        metric: "billing_balance",
        used: 0,
        limit: 10,
        remaining: 10,
        type: "credits",
      }),
    ]);

    const before = await listLatestQuotasForEnabledServices(db);
    const balanceBefore = before.find((r) => r.metric === "billing_balance");
    assert.ok(balanceBefore);
    assert.equal(balanceBefore.limit_value, 10);
    assert.equal(balanceBefore.remaining_value, 10);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q3", metric: "ubi_quota", used: 8, limit: 20, remaining: 12 }),
    ]);

    const after = await listLatestQuotasForEnabledServices(db);
    const balanceAfter = after.find((r) => r.metric === "billing_balance");
    assert.ok(balanceAfter, "billing_balance row should still exist (zeroed)");
    assert.equal(balanceAfter.limit_value, 0);
    assert.equal(balanceAfter.used_value, 0);
    assert.equal(balanceAfter.remaining_value, 0);
    assert.equal(balanceAfter.type, "credits", "type should be preserved from original row");
  } finally {
    await runtime.dispose();
  }
});

test("zeroed metric does not produce duplicate zeros on subsequent saves", async () => {
  const { runtime, db } = await setup();
  try {
    await insertService(db);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q1", metric: "ubi_quota" }),
      makeQuota({ id: "q2", metric: "billing_balance", type: "credits" }),
    ]);

    await saveQuotasToDb(db, SERVICE, [makeQuota({ id: "q3", metric: "ubi_quota" })]);
    await saveQuotasToDb(db, SERVICE, [makeQuota({ id: "q4", metric: "ubi_quota" })]);

    const rows = await db.all<{ metric: string; remaining_value: number }>(
      "SELECT metric, remaining_value FROM quotas WHERE service_id = ? AND metric = ? ORDER BY rowid",
      [SERVICE.id, "billing_balance"],
    );

    const zeroRows = rows.filter((r) => r.remaining_value === 0);
    assert.ok(zeroRows.length >= 2, "each save should record a zero (history preserved)");

    const latest = await listLatestQuotasForEnabledServices(db);
    const balanceLatest = latest.find((r) => r.metric === "billing_balance");
    assert.ok(balanceLatest);
    assert.equal(balanceLatest.remaining_value, 0);
  } finally {
    await runtime.dispose();
  }
});

test("metric that reappears after zeroing shows new value", async () => {
  const { runtime, db } = await setup();
  try {
    await insertService(db);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q1", metric: "ubi_quota" }),
      makeQuota({ id: "q2", metric: "billing_balance", limit: 10, remaining: 10, type: "credits" }),
    ]);

    await saveQuotasToDb(db, SERVICE, [makeQuota({ id: "q3", metric: "ubi_quota" })]);

    const afterZero = await listLatestQuotasForEnabledServices(db);
    assert.equal(afterZero.find((r) => r.metric === "billing_balance")?.remaining_value, 0);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q4", metric: "ubi_quota" }),
      makeQuota({
        id: "q5",
        metric: "billing_balance",
        limit: 25,
        used: 0,
        remaining: 25,
        type: "credits",
      }),
    ]);

    const afterReappear = await listLatestQuotasForEnabledServices(db);
    const balance = afterReappear.find((r) => r.metric === "billing_balance");
    assert.ok(balance);
    assert.equal(balance.limit_value, 25);
    assert.equal(balance.remaining_value, 25);
  } finally {
    await runtime.dispose();
  }
});

test("usage_history records zero when metric disappears", async () => {
  const { runtime, db } = await setup();
  try {
    await insertService(db);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q1", metric: "ubi_quota" }),
      makeQuota({ id: "q2", metric: "billing_balance", used: 0, type: "credits" }),
    ]);

    await saveQuotasToDb(db, SERVICE, [makeQuota({ id: "q3", metric: "ubi_quota" })]);

    const history = await db.all<{ value: number }>(
      "SELECT value FROM usage_history WHERE service_id = ? AND metric = ? ORDER BY ts DESC LIMIT 1",
      [SERVICE.id, "billing_balance"],
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].value, 0);
  } finally {
    await runtime.dispose();
  }
});

test("other service quotas are not affected by zeroing", async () => {
  const { runtime, db } = await setup();
  try {
    await insertService(db);
    const otherService: AIService = { ...SERVICE, id: "svc_other", name: "Other" };
    await db.run(
      "INSERT INTO services (id, name, provider, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [otherService.id, otherService.name, otherService.provider, 1, 2, 1000, 1000],
    );

    await saveQuotasToDb(db, otherService, [
      makeQuota({
        id: "o1",
        metric: "billing_balance",
        serviceId: otherService.id,
        limit: 50,
        remaining: 50,
        type: "credits",
      }),
    ]);

    await saveQuotasToDb(db, SERVICE, [
      makeQuota({ id: "q1", metric: "ubi_quota" }),
      makeQuota({ id: "q2", metric: "billing_balance", limit: 10, remaining: 10, type: "credits" }),
    ]);

    await saveQuotasToDb(db, SERVICE, [makeQuota({ id: "q3", metric: "ubi_quota" })]);

    const latest = await listLatestQuotasForEnabledServices(db);
    const otherBalance = latest.find(
      (r) => r.service_id === otherService.id && r.metric === "billing_balance",
    );
    assert.ok(otherBalance);
    assert.equal(otherBalance.remaining_value, 50, "other service balance should be untouched");

    const ampBalance = latest.find(
      (r) => r.service_id === SERVICE.id && r.metric === "billing_balance",
    );
    assert.ok(ampBalance);
    assert.equal(ampBalance.remaining_value, 0);
  } finally {
    await runtime.dispose();
  }
});
