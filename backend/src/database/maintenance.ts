import type { Database } from "sqlite";
import type sqlite3 from "sqlite3";
import { logger } from "../utils/logger.ts";

export async function runMaintenance(db: Database<sqlite3.Database>): Promise<void> {
  try {
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
    await db.exec(`PRAGMA incremental_vacuum;`);

    logger.info("[Database] Maintenance complete: WAL checkpoint and incremental vacuum");
  } catch (error) {
    logger.error({ err: error }, "[Database] Maintenance failed");
  }
}
