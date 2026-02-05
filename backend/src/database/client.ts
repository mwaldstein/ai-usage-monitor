import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { toDbError } from "./errors.ts";

export interface EffectDatabaseClient {
  all<T extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Effect.Effect<readonly T[], unknown>;
  get<T extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Effect.Effect<T | undefined, unknown>;
  run(sql: string, params?: readonly unknown[]): Effect.Effect<void, unknown>;
  exec(sql: string): Effect.Effect<void, unknown>;
}

export interface DatabaseClient {
  all<T extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]>;
  get<T extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | undefined>;
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  exec(sql: string): Promise<void>;
  withTransaction<T>(
    operation: (txDb: EffectDatabaseClient) => Effect.Effect<T, unknown>,
  ): Promise<T>;
}

interface MakeDatabaseClientOptions {
  runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>;
  sqlClient: SqlClient.SqlClient;
}

export function makeDatabaseClient(options: MakeDatabaseClientOptions): DatabaseClient {
  const { runtime, sqlClient } = options;
  const effectDb = makeEffectDatabaseClient(sqlClient);

  return {
    all<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<readonly T[]> {
      return runtime.runPromise(effectDb.all<T>(sql, params));
    },

    get<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<T | undefined> {
      return runtime.runPromise(effectDb.get<T>(sql, params));
    },

    run(sql: string, params: readonly unknown[] = []): Promise<void> {
      return runtime.runPromise(effectDb.run(sql, params));
    },

    exec(sql: string): Promise<void> {
      return runtime.runPromise(effectDb.exec(sql));
    },

    async withTransaction<T>(
      operation: (txDb: EffectDatabaseClient) => Effect.Effect<T, unknown>,
    ): Promise<T> {
      try {
        const txDb = makeEffectDatabaseClient(sqlClient);
        return await runtime.runPromise(sqlClient.withTransaction(operation(txDb)));
      } catch (error) {
        throw toDbError(error, { operation: "query" });
      }
    },
  };
}

function makeEffectDatabaseClient(sqlClient: SqlClient.SqlClient): EffectDatabaseClient {
  function queryRows<T extends object>(
    sql: string,
    params: readonly unknown[] = [],
  ): Effect.Effect<readonly T[], unknown> {
    const statement = sqlClient.unsafe<T>(sql, params);
    return Effect.catchAll(statement, (error) =>
      Effect.fail(toDbError(error, { operation: "query", sql, params })),
    );
  }

  return {
    all<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Effect.Effect<readonly T[], unknown> {
      return queryRows<T>(sql, params);
    },

    get<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Effect.Effect<T | undefined, unknown> {
      return Effect.map(queryRows<T>(sql, params), (rows) => rows[0]);
    },

    run(sql: string, params: readonly unknown[] = []): Effect.Effect<void, unknown> {
      return Effect.asVoid(queryRows(sql, params));
    },

    exec(sql: string): Effect.Effect<void, unknown> {
      return Effect.forEach(
        splitSqlStatements(sql),
        (statement) => (statement.length === 0 ? Effect.void : Effect.asVoid(queryRows(statement))),
        { discard: true },
      );
    },
  };
}

function splitSqlStatements(sqlScript: string): readonly string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (const char of sqlScript) {
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (char === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}
