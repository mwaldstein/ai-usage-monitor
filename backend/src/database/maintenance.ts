import type { DatabaseClient } from "./client.ts";
import { logger } from "../utils/logger.ts";

export async function runMaintenance(db: DatabaseClient): Promise<void> {
  try {
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE);`);
    await db.exec(`PRAGMA incremental_vacuum;`);

    logger.info("[Database] Maintenance complete: WAL checkpoint and incremental vacuum");
  } catch (error) {
    logger.error({ err: error }, "[Database] Maintenance failed");
  }
}
