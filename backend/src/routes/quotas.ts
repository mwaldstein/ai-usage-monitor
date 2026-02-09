import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import {
  findEnabledServiceById,
  listEnabledServices,
  updateServiceHealth,
} from "../database/queries/services.ts";
import { listQuotasWithEnabledServices } from "../database/queries/usage.ts";
import { ServiceFactory } from "../services/factory.ts";
import { saveQuotasToDb } from "../services/quotas/persistence.ts";
import { mapQuotaRow } from "./mappers.ts";
import type { ServiceStatus } from "../types/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { ApiError, QuotasResponse, RefreshQuotasParams, RefreshQuotasResponse } from "shared/api";
import { ServiceStatus as ServiceStatusSchema } from "shared/schemas";

const router = Router();

const SERVICE_TIMEOUT = 15000;

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await listQuotasWithEnabledServices(db);
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
    const services = await listEnabledServices(db);
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

        const errorKind = status.authError ? "auth" : status.error ? "fetch" : null;
        await updateServiceHealth(db, service.id, status.error ?? null, errorKind);
        results.push(status);
      } catch (error) {
        logger.error({ err: error }, `Error refreshing quotas for ${service.name}`);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await updateServiceHealth(db, service.id, errorMsg, "fetch");
        results.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: errorMsg,
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
    const service = await findEnabledServiceById(db, serviceId);

    if (!service) {
      return res.status(404).json(S.encodeSync(ApiError)({ error: "Service not found" }));
    }

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

    const errorKind = status.authError ? "auth" : status.error ? "fetch" : null;
    await updateServiceHealth(db, service.id, status.error ?? null, errorKind);

    res.json(S.encodeSync(ServiceStatusSchema)(status));
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas for service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to refresh service" }));
  }
});

export default router;
