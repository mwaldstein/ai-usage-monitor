import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import { ServiceFactory } from "../services/factory.ts";
import { mapQuotaRow, mapServiceRow } from "./mappers.ts";
import type { AIService, ServiceStatus, UsageQuota } from "../types/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { ApiError, QuotasResponse, RefreshQuotasParams, RefreshQuotasResponse } from "shared/api";
import { ServiceStatus as ServiceStatusSchema } from "shared/schemas";

const router = Router();

const SERVICE_TIMEOUT = 15000;

async function saveQuotasToDb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  service: AIService,
  quotas: readonly UsageQuota[],
): Promise<void> {
  const now = nowTs();
  for (const quota of quotas) {
    await db.run(
      `INSERT INTO quotas (id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       limit_value = excluded.limit_value,
       used_value = excluded.used_value,
       remaining_value = excluded.remaining_value,
       type = excluded.type,
       replenishment_amount = excluded.replenishment_amount,
       replenishment_period = excluded.replenishment_period,
       reset_at = excluded.reset_at,
       updated_at = ?`,
      [
        quota.id,
        quota.serviceId,
        quota.metric,
        quota.limit,
        quota.used,
        quota.remaining,
        quota.type || null,
        quota.replenishmentRate?.amount ?? null,
        quota.replenishmentRate?.period ?? null,
        quota.resetAt,
        now,
        now,
        now,
      ],
    );

    await db.run(
      "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
      [quota.serviceId, quota.metric, now, quota.used],
    );
  }
}

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all(`
      SELECT q.*, s.name as service_name, s.provider
      FROM quotas q
      JOIN services s ON q.service_id = s.id
      WHERE s.enabled = 1
      ORDER BY s.name, q.metric
    `);
    const quotas = rows.map(mapQuotaRow);
    res.json(S.encodeSync(QuotasResponse)(quotas));
  } catch (error) {
    logger.error({ err: error }, "Error fetching quotas");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch quotas" }));
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");
    const services: AIService[] = rows.map(mapServiceRow);
    const results: ServiceStatus[] = [];

    for (const service of services) {
      try {
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service refresh timeout")), SERVICE_TIMEOUT),
          ),
        ]);

        if (status.quotas && status.quotas.length > 0) {
          try {
            await saveQuotasToDb(db, service, status.quotas);
          } catch (dbError) {
            logger.error({ err: dbError }, `Database error saving quotas for ${service.name}`);
          }
        }

        results.push(status);
      } catch (error) {
        logger.error({ err: error }, `Error refreshing quotas for ${service.name}`);
        results.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json(S.encodeSync(RefreshQuotasResponse)(results));
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to refresh quotas" }));
  }
});

router.post("/refresh/:serviceId", async (req, res) => {
  try {
    const paramsDecoded = S.decodeUnknownEither(RefreshQuotasParams)(req.params);
    if (Either.isLeft(paramsDecoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid service id", details: paramsDecoded.left }));
    }

    const { serviceId } = paramsDecoded.right;
    if (!serviceId.trim()) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: "Service id required" }));
    }

    const db = getDatabase();
    const row = await db.get("SELECT * FROM services WHERE id = ? AND enabled = 1", [serviceId]);

    if (!row) {
      return res.status(404).json(S.encodeSync(ApiError)({ error: "Service not found" }));
    }

    const service = mapServiceRow(row);

    const status = await Promise.race([
      ServiceFactory.getServiceStatus(service),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Service refresh timeout")), SERVICE_TIMEOUT),
      ),
    ]);

    if (status.quotas && status.quotas.length > 0) {
      try {
        await saveQuotasToDb(db, service, status.quotas);
      } catch (dbError) {
        logger.error({ err: dbError }, `Database error saving quotas for ${service.name}`);
      }
    }

    res.json(S.encodeSync(ServiceStatusSchema)(status));
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas for service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to refresh service" }));
  }
});

export default router;
