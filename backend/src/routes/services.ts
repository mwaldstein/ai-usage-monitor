import { Router } from "express";
import { randomUUID } from "crypto";
import { getDatabase } from "../database/index.ts";
import { mapServiceRow } from "./mappers.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all(
      "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
    );
    const services = rows.map(mapServiceRow);
    res.json(services);
  } catch (error) {
    logger.error({ err: error }, "Error fetching services");
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, provider, apiKey, bearerToken, baseUrl } = req.body;

    if (!name || !provider) {
      return res.status(400).json({ error: "Name and provider are required" });
    }

    const id = randomUUID();
    const now = nowTs();
    const db = getDatabase();

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
        1,
        displayOrder,
        now,
        now,
      ],
    );

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.status(201).json(mapServiceRow(service));
  } catch (error) {
    logger.error({ err: error }, "Error adding service");
    res.status(500).json({ error: "Failed to add service" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, apiKey, bearerToken, baseUrl, enabled, displayOrder } = req.body;

    const db = getDatabase();

    const updates: string[] = [];
    const params: any[] = [];

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
      return res.status(400).json({ error: "No valid fields to update" });
    }

    updates.push("updated_at = ?");
    params.push(nowTs());
    await db.run(`UPDATE services SET ${updates.join(", ")} WHERE id = ?`, [...params, id]);

    const service = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    res.json(mapServiceRow(service));
  } catch (error) {
    logger.error({ err: error }, "Error updating service");
    res.status(500).json({ error: "Failed to update service" });
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
    res.status(500).json({ error: "Failed to delete service" });
  }
});

router.post("/reorder", async (req, res) => {
  try {
    const { serviceIds } = req.body;

    if (!Array.isArray(serviceIds)) {
      return res.status(400).json({ error: "serviceIds must be an array" });
    }

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

    res.json(services);
  } catch (error) {
    logger.error({ err: error }, "Error reordering services");
    res.status(500).json({ error: "Failed to reorder services" });
  }
});

export default router;
