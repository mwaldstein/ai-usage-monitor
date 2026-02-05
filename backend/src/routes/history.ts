import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import { logger } from "../utils/logger.ts";
import { ApiError, HistoryQuery, HistoryResponse } from "shared/api";
import { optionalNonEmptyFieldError, parseBoundedInt } from "./queryValidation.ts";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const decodedQuery = S.decodeUnknownEither(HistoryQuery)(req.query);
    if (Either.isLeft(decodedQuery)) {
      return res.status(400).json(
        S.encodeSync(ApiError)({
          error: "Invalid query parameters",
          details: decodedQuery.left,
        }),
      );
    }

    const { serviceId, metric, hours } = decodedQuery.right;
    const serviceIdError = optionalNonEmptyFieldError(serviceId, "serviceId");
    if (serviceIdError) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: serviceIdError }));
    }

    const metricError = optionalNonEmptyFieldError(metric, "metric");
    if (metricError) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: metricError }));
    }

    const hoursResult = parseBoundedInt(hours, 24, 1, 168, "hours");
    if (!hoursResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: hoursResult.error }));
    }

    const db = getDatabase();

    const hoursNum = hoursResult.value;
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
    res.json(S.encodeSync(HistoryResponse)(history));
  } catch (error) {
    logger.error({ err: error }, "Error fetching usage history");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch usage history" }));
  }
});

export default router;
