import * as Effect from "effect/Effect";
import type { DatabaseClient, EffectDatabaseClient } from "./client.ts";
import { isBusyDbError } from "./errors.ts";

type DbTransaction = Pick<DatabaseClient, "withTransaction">;

const BUSY_RETRY_DELAYS_MS = [25, 75, 150] as const;

export async function runInTransaction<T>(
  db: DbTransaction,
  operation: (txDb: EffectDatabaseClient) => Effect.Effect<T, unknown>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.withTransaction(operation);
    } catch (error) {
      if (isBusyDbError(error) && attempt < BUSY_RETRY_DELAYS_MS.length) {
        await sleep(BUSY_RETRY_DELAYS_MS[attempt]);
        continue;
      }

      throw error;
    }
  }
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
