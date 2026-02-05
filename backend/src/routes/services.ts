import { Router } from "express";
import { randomUUID } from "crypto";
import { Schema as S, Either, Effect } from "effect";
import { getDatabase, runInTransaction } from "../database/index.ts";
import {
  countServices,
  deleteServiceById,
  findServiceById,
  insertService,
  listEnabledServices,
  runServiceUpdate,
} from "../database/queries/services.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import {
  ApiError,
  CreateServiceRequest,
  CreateServiceResponse,
  ListServicesResponse,
  ReorderServicesRequest,
  ReorderServicesResponse,
  ServiceIdParams,
  UpdateServiceRequest,
  UpdateServiceResponse,
} from "shared/api";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const services = await listEnabledServices(db);
    res.json(S.encodeSync(ListServicesResponse)(services));
  } catch (error) {
    logger.error({ err: error }, "Error fetching services");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch services" }));
  }
});

router.post("/", async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(CreateServiceRequest)(req.body);
    if (Either.isLeft(decoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid request body", details: decoded.left }));
    }

    const { name, provider, apiKey, bearerToken, baseUrl, enabled } = decoded.right;

    if (!name.trim() || !provider) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Name and provider are required" }));
    }

    const id = randomUUID();
    const now = nowTs();
    const db = getDatabase();
    const isEnabled = enabled ?? true;

    const displayOrder = (await countServices(db)) + 1;

    await insertService(db, {
      id,
      name,
      provider,
      apiKey: apiKey || null,
      bearerToken: bearerToken || null,
      baseUrl: baseUrl || null,
      enabled: isEnabled ? 1 : 0,
      displayOrder,
      createdAt: now,
      updatedAt: now,
    });

    const service = await findServiceById(db, id);
    if (!service) {
      logger.error({ serviceId: id }, "Inserted service was not found");
      return res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to add service" }));
    }

    res.status(201).json(S.encodeSync(CreateServiceResponse)(service));
  } catch (error) {
    logger.error({ err: error }, "Error adding service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to add service" }));
  }
});

router.put("/:id", async (req, res) => {
  try {
    const paramsDecoded = S.decodeUnknownEither(ServiceIdParams)(req.params);
    if (Either.isLeft(paramsDecoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid service id", details: paramsDecoded.left }));
    }

    const { id } = paramsDecoded.right;
    if (!id.trim()) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: "Service id required" }));
    }

    const decoded = S.decodeUnknownEither(UpdateServiceRequest)(req.body);
    if (Either.isLeft(decoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid request body", details: decoded.left }));
    }

    const { name, apiKey, bearerToken, baseUrl, enabled, displayOrder } = decoded.right;

    const db = getDatabase();

    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    if (typeof name === "string") {
      updates.push("name = ?");
      params.push(name);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "apiKey")) {
      updates.push("api_key = ?");
      params.push(apiKey ? apiKey : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "bearerToken")) {
      updates.push("bearer_token = ?");
      params.push(bearerToken ? bearerToken : null);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "baseUrl")) {
      updates.push("base_url = ?");
      params.push(baseUrl ? baseUrl : null);
    }

    if (typeof enabled === "boolean") {
      updates.push("enabled = ?");
      params.push(enabled ? 1 : 0);
    }

    if (typeof displayOrder === "number") {
      updates.push("display_order = ?");
      params.push(displayOrder);
    }

    if (updates.length === 0) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: "No valid fields to update" }));
    }

    updates.push("updated_at = ?");
    params.push(nowTs());
    await runServiceUpdate(db, {
      statement: `UPDATE services SET ${updates.join(", ")} WHERE id = ?`,
      params: [...params, id],
    });

    const service = await findServiceById(db, id);
    if (!service) {
      return res.status(404).json(S.encodeSync(ApiError)({ error: "Service not found" }));
    }

    res.json(S.encodeSync(UpdateServiceResponse)(service));
  } catch (error) {
    logger.error({ err: error }, "Error updating service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to update service" }));
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const paramsDecoded = S.decodeUnknownEither(ServiceIdParams)(req.params);
    if (Either.isLeft(paramsDecoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid service id", details: paramsDecoded.left }));
    }

    const { id } = paramsDecoded.right;
    if (!id.trim()) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: "Service id required" }));
    }

    const db = getDatabase();

    await deleteServiceById(db, id);
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Error deleting service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to delete service" }));
  }
});

router.post("/reorder", async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(ReorderServicesRequest)(req.body);
    if (Either.isLeft(decoded)) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Invalid request body", details: decoded.left }));
    }

    const { serviceIds } = decoded.right;

    const db = getDatabase();
    const now = nowTs();

    await runInTransaction(db, (txDb) =>
      Effect.forEach(
        serviceIds,
        (serviceId, index) =>
          txDb.run("UPDATE services SET display_order = ?, updated_at = ? WHERE id = ?", [
            index + 1,
            now,
            serviceId,
          ]),
        { discard: true },
      ),
    );

    const services = await listEnabledServices(db);

    res.json(S.encodeSync(ReorderServicesResponse)(services));
  } catch (error) {
    logger.error({ err: error }, "Error reordering services");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to reorder services" }));
  }
});

export default router;
