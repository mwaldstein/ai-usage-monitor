import { Router } from "express";
import { getDatabase } from "../database/index.ts";
import { logger } from "../utils/logger.ts";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { serviceId, metric, hours = 24 } = req.query;
    const db = getDatabase();

    const hoursNum = Math.max(1, Math.min(168, parseInt(String(hours), 10) || 24));
    const sinceTs = Math.floor((Date.now() - hoursNum * 60 * 60 * 1000) / 1000);

    let query = `
      SELECT
        uh.service_id as serviceId,
        uh.metric as metric,
        uh.value as value,
        uh.ts as ts,
        s.name as service_name
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;
    const params: (string | number)[] = [];
    params.push(sinceTs);

    if (serviceId) {
      query += " AND uh.service_id = ?";
      params.push(String(serviceId));
    }

    if (metric) {
      query += " AND uh.metric = ?";
      params.push(String(metric));
    }

    query += " ORDER BY uh.ts DESC";

    const history = await db.all(query, params);
    res.json(history);
  } catch (error) {
    logger.error({ err: error }, "Error fetching usage history");
    res.status(500).json({ error: "Failed to fetch usage history" });
  }
});

export default router;
