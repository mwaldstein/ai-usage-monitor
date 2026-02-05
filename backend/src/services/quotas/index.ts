import type { ServerMessage as ServerMessageType } from "shared/ws";
import type { AIService, ServiceStatus } from "../../types/index.ts";
import { getDatabase } from "../../database/index.ts";
import { listEnabledServices } from "../../database/queries/services.ts";
import { logger } from "../../utils/logger.ts";
import { nowTs } from "../../utils/dates.ts";
import { getRefreshIntervalMinutes } from "./interval.ts";
import { saveQuotasToDb } from "./persistence.ts";
import { refreshService } from "./refreshService.ts";

let refreshInProgress = false;

export function isRefreshInProgress(): boolean {
  return refreshInProgress;
}

export { getRefreshIntervalMinutes };

export async function refreshQuotas(
  broadcast: (data: ServerMessageType) => void,
  refreshInterval: string,
): Promise<void> {
  if (refreshInProgress) {
    logger.info("Refresh already in progress; skipping this run");
    return;
  }

  refreshInProgress = true;
  try {
    logger.info("Refreshing quotas...");
    const db = getDatabase();
    const services: readonly AIService[] = await listEnabledServices(db);

    const results: ServiceStatus[] = [];
    const intervalMinutes = getRefreshIntervalMinutes(refreshInterval);
    const staggerDelayMs =
      services.length > 1 ? (intervalMinutes * 60 * 1000) / services.length : 0;

    for (let i = 0; i < services.length; i++) {
      const service = services[i];

      if (i > 0 && staggerDelayMs > 0) {
        logger.info(
          { service: service.name, waitSeconds: Math.round(staggerDelayMs / 1000) },
          "Staggering service refresh",
        );
        await new Promise((resolve) => setTimeout(resolve, staggerDelayMs));
      }

      const status = await refreshService(service);
      results.push(status);

      if (status.quotas && status.quotas.length > 0) {
        try {
          await saveQuotasToDb(db, service, status.quotas);
        } catch (dbError) {
          logger.error(
            { err: dbError, service: service.name },
            "Database error while saving quotas",
          );
        }
      }
    }

    broadcast({
      type: "status",
      data: results,
      ts: nowTs(),
    });

    logger.info("Quotas refreshed successfully");
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas");
  } finally {
    refreshInProgress = false;
  }
}
