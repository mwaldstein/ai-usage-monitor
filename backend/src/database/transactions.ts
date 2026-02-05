import type { Database } from "sqlite";
import type sqlite3 from "sqlite3";

type DbTransaction = Database<sqlite3.Database>;

export async function runInTransaction<T>(
  db: DbTransaction,
  operation: () => Promise<T>,
): Promise<T> {
  await db.exec("BEGIN IMMEDIATE");

  try {
    const result = await operation();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures so original error is preserved.
    }
    throw error;
  }
}
