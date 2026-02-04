import { Router } from "express";
import { randomUUID } from "crypto";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import { mapServiceRow } from "./mappers.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import {
  ApiError,
  CreateServiceRequest,
  CreateServiceResponse,
  ListServicesResponse,
  ReorderServicesRequest,
  ReorderServicesResponse,
  UpdateServiceRequest,
  UpdateServiceResponse,
} from "shared/api";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all(
      "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
    );
    const services = rows.map(mapServiceRow);
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

    if (!name || !provider) {
      return res
        .status(400)
        .json(S.encodeSync(ApiError)({ error: "Name and provider are required" }));
    }

    const id = randomUUID();
    const now = nowTs();
    const db = getDatabase();
    const isEnabled = enabled ?? true;

    const countResult = await db.get("SELECT COUNT(*) as count FROM services");
    const displayOrder = (countResult?.count || 0) + 1;

    await db.run(
      "INSERT INTO services (id, name, provider, api_key, bearer_token, base_url, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        name,
        provider,
        apiKey || null,
        bearerToken || null,
        baseUrl || null,
        isEnabled ? 1 : 0,
        displayOrder,
        now,
        now,
      ],
    );

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.status(201).json(S.encodeSync(CreateServiceResponse)(mapServiceRow(service)));
  } catch (error) {
    logger.error({ err: error }, "Error adding service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to add service" }));
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
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
    await db.run(`UPDATE services SET ${updates.join(", ")} WHERE id = ?`, [...params, id]);

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.json(S.encodeSync(UpdateServiceResponse)(mapServiceRow(service)));
  } catch (error) {
    logger.error({ err: error }, "Error updating service");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to update service" }));
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    await db.run("DELETE FROM services WHERE id = ?", [id]);
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

    for (let i = 0; i < serviceIds.length; i++) {
      await db.run("UPDATE services SET display_order = ?, updated_at = ? WHERE id = ?", [
        i + 1,
        now,
        serviceIds[i],
      ]);
    }

    const rows = await db.all(
      "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
    );
    const services = rows.map(mapServiceRow);

    res.json(S.encodeSync(ReorderServicesResponse)(services));
  } catch (error) {
    logger.error({ err: error }, "Error reordering services");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to reorder services" }));
  }
});

export default router;
