import type { DatabaseClient } from "./client.ts";
import { isBusyDbError, toDbError } from "./errors.ts";

type DbTransaction = Pick<DatabaseClient, "exec">;

const BUSY_RETRY_DELAYS_MS = [25, 75, 150] as const;

export async function runInTransaction<T>(
  db: DbTransaction,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      await execSql(db, "BEGIN IMMEDIATE");

      try {
        const result = await operation();
        await execSql(db, "COMMIT");
        return result;
      } catch (error) {
        await rollbackQuietly(db);
        throw error;
      }
    } catch (error) {
      if (isBusyDbError(error) && attempt < BUSY_RETRY_DELAYS_MS.length) {
        await sleep(BUSY_RETRY_DELAYS_MS[attempt]);
        continue;
      }

      throw error;
    }
  }
}

async function execSql(db: DbTransaction, sql: string): Promise<void> {
  try {
    await db.exec(sql);
  } catch (error) {
    throw toDbError(error, { operation: "query", sql });
  }
}

async function rollbackQuietly(db: DbTransaction): Promise<void> {
  try {
    await db.exec("ROLLBACK");
  } catch {
    // Ignore rollback failures so original error is preserved.
  }
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
