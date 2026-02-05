import * as SqlClient from "@effect/sql/SqlClient";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { toDbError } from "./errors.ts";

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
}

interface MakeDatabaseClientOptions {
  runtime: ManagedRuntime.ManagedRuntime<SqlClient.SqlClient, unknown>;
  sqlClient: SqlClient.SqlClient;
}

export function makeDatabaseClient(options: MakeDatabaseClientOptions): DatabaseClient {
  const { runtime, sqlClient } = options;

  async function queryRows<T extends object>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<readonly T[]> {
    try {
      const statement = sqlClient.unsafe<T>(sql, params);
      return await runtime.runPromise(statement);
    } catch (error) {
      throw toDbError(error, { operation: "query", sql, params });
    }
  }

  return {
    all<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<readonly T[]> {
      return queryRows<T>(sql, params);
    },

    async get<T extends object = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<T | undefined> {
      const rows = await queryRows<T>(sql, params);
      return rows[0];
    },

    async run(sql: string, params: readonly unknown[] = []): Promise<void> {
      await queryRows(sql, params);
    },

    async exec(sql: string): Promise<void> {
      for (const statement of splitSqlStatements(sql)) {
        if (statement.length === 0) {
          continue;
        }

        await queryRows(statement);
      }
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
