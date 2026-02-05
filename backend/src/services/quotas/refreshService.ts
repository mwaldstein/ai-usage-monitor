import type { AIService, ServiceStatus } from "../../types/index.ts";
import { ServiceFactory } from "../factory.ts";
import { logger } from "../../utils/logger.ts";
import { nowTs } from "../../utils/dates.ts";

export async function refreshService(service: AIService): Promise<ServiceStatus> {
  try {
    const status = await Promise.race([
      ServiceFactory.getServiceStatus(service),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Service refresh timeout")), 15000),
      ),
    ]);

    return status;
  } catch (error) {
    logger.error({ err: error, service: service.name }, "Error refreshing quotas for service");
    return {
      service,
      quotas: [],
      lastUpdated: nowTs(),
      isHealthy: false,
      authError: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
