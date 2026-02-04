import { Router } from "express";
import { Schema as S } from "effect";
import { getDatabase } from "../database/index.ts";
import { ServiceFactory } from "../services/factory.ts";
import { mapServiceRow, mapQuotaRow } from "./mappers.ts";
import type { AIService, ServiceStatus, UsageQuota } from "../types/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { getJWTExpiration } from "../utils/jwt.ts";
import { ApiError, CachedStatusResponse, StatusResponse } from "shared/api";

const router = Router();

const SERVICE_TIMEOUT = 15000;

/**
 * Extract JWT expiration from service bearer token or API key
 */
function extractTokenExpiration(service: AIService): number | undefined {
  if (service.bearerToken) {
    const exp = getJWTExpiration(service.bearerToken);
    if (exp) return exp;
  }
  if (service.apiKey) {
    const exp = getJWTExpiration(service.apiKey);
    if (exp) return exp;
  }
  return undefined;
}

router.get("/cached", async (req, res) => {
  try {
    const db = getDatabase();
    const serviceRows = await db.all("SELECT * FROM services WHERE enabled = 1");
    const services: AIService[] = serviceRows.map(mapServiceRow);

    const quotaRows = await db.all(`
      SELECT * FROM (
        SELECT q.*,
               ROW_NUMBER() OVER (
                  PARTITION BY q.service_id, q.metric
                  ORDER BY q.rowid DESC
                ) AS rn
        FROM quotas q
        JOIN services s ON s.id = q.service_id
        WHERE s.enabled = 1
      )
      WHERE rn = 1
    `);

    const quotasByService = new Map<string, UsageQuota[]>();
    for (const row of quotaRows) {
      const quota = mapQuotaRow(row);
      const list = quotasByService.get(quota.serviceId) || [];
      list.push(quota);
      quotasByService.set(quota.serviceId, list);
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = quotasByService.get(service.id) || [];
      const lastUpdated = quotas.reduce<number>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        0,
      );

      return {
        service,
        quotas,
        lastUpdated: lastUpdated > 0 ? lastUpdated : service.updatedAt,
        isHealthy: quotas.length > 0,
        authError: false,
        error: quotas.length > 0 ? undefined : "No cached quota data yet",
        tokenExpiration: extractTokenExpiration(service),
      };
    });

    res.json(S.encodeSync(CachedStatusResponse)(statuses));
  } catch (error) {
    logger.error({ err: error }, "Error fetching cached status");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch cached status" }));
  }
});

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");
    const services: AIService[] = rows.map(mapServiceRow);
    const statuses: ServiceStatus[] = [];

    for (const service of services) {
      try {
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service status timeout")), SERVICE_TIMEOUT),
          ),
        ]);
        statuses.push(status);
      } catch (error) {
        logger.error({ err: error }, `Error fetching status for ${service.name}`);
        statuses.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : "Unknown error",
          tokenExpiration: extractTokenExpiration(service),
        });
      }
    }

    res.json(S.encodeSync(StatusResponse)(statuses));
  } catch (error) {
    logger.error({ err: error }, "Error fetching status");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch status" }));
  }
});

export default router;
