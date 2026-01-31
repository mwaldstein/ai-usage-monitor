import { Router } from "express";
import { getDatabase } from "../database/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";

const router = Router();

router.get("/history", async (req, res) => {
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

router.get("/analytics", async (req, res) => {
  try {
    const { days = 30, serviceId, interval = "1h", groupBy = "service" } = req.query;
    const db = getDatabase();

    const daysNum = Math.max(1, Math.min(365, parseInt(String(days), 10) || 30));
    const sinceTs = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);

    logger.info({ days: daysNum, interval, groupBy, sinceTs }, "API /usage/analytics request");

    const intervalMatch = String(interval).match(/^(\d+)(m|h|d)$/);
    const intervalMinutes = intervalMatch
      ? parseInt(intervalMatch[1]) *
        (intervalMatch[2] === "d" ? 1440 : intervalMatch[2] === "h" ? 60 : 1)
      : 60;

    const intervalSeconds = intervalMinutes * 60;
    const timeBucket = `(uh.ts / ${intervalSeconds}) * ${intervalSeconds}`;

    const groupByColumn = String(groupBy);
    let selectColumns: string;
    let groupByClause: string;

    if (groupByColumn === "metric") {
      selectColumns = `
        'All Services' as service_name,
        'all' as provider,
        'all' as serviceId,
        uh.metric as metric`;
      groupByClause = `uh.metric, ${timeBucket}`;
    } else if (groupByColumn === "provider") {
      selectColumns = `
        s.provider as service_name,
        s.provider as provider,
        s.provider as serviceId,
        uh.metric as metric`;
      groupByClause = `s.provider, uh.metric, ${timeBucket}`;
    } else {
      selectColumns = `
        s.name as service_name,
        s.provider as provider,
        uh.service_id as serviceId,
        uh.metric as metric`;
      groupByClause = `s.name, s.provider, uh.service_id, uh.metric, ${timeBucket}`;
    }

    let timeSeriesQuery = `
      SELECT
        ${selectColumns},
        ${timeBucket} as ts,
        AVG(uh.value) as avg_value,
        MIN(uh.value) as min_value,
        MAX(uh.value) as max_value,
        COUNT(*) as data_points
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;

    const params: (string | number)[] = [sinceTs];

    if (serviceId) {
      timeSeriesQuery += " AND uh.service_id = ?";
      params.push(String(serviceId));
    }

    timeSeriesQuery += `
      GROUP BY ${groupByClause}
      ORDER BY ts ASC, metric
    `;

    const timeSeries = await db.all(timeSeriesQuery, params);

    const quotasQuery = `
      SELECT
        q.service_id as serviceId,
        q.metric as metric,
        q.limit_value as "limit",
        q.used_value as used,
        q.type as type,
        s.name as service_name,
        s.provider as provider
      FROM quotas q
      JOIN services s ON q.service_id = s.id
      WHERE s.enabled = 1
    `;

    const quotas = serviceId
      ? await db.all(quotasQuery + " AND q.service_id = ?", [serviceId])
      : await db.all(quotasQuery);

    let summaryQuery = `
      SELECT
        s.name as service_name,
        s.provider as provider,
        uh.service_id as serviceId,
        uh.metric as metric,
        MIN(uh.value) as min_value,
        MAX(uh.value) as max_value,
        AVG(uh.value) as avg_value,
        (MAX(uh.value) - MIN(uh.value)) as total_consumed,
        MIN(uh.ts) as first_record_ts,
        MAX(uh.ts) as last_record_ts,
        COUNT(DISTINCT uh.ts / 86400) as active_days
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
    `;

    const summaryParams: (string | number)[] = [sinceTs];

    if (serviceId) {
      summaryQuery += " AND uh.service_id = ?";
      summaryParams.push(String(serviceId));
    }

    summaryQuery += `
      GROUP BY s.name, s.provider, uh.service_id, uh.metric
      ORDER BY total_consumed DESC
    `;

    const summary = await db.all(summaryQuery, summaryParams);

    res.json({
      timeSeries,
      quotas,
      summary,
      days: daysNum,
      generatedAt: nowTs(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching usage analytics");
    res.status(500).json({ error: "Failed to fetch usage analytics" });
  }
});

router.get("/providers", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const db = getDatabase();

    const daysNum = Math.max(1, Math.min(365, parseInt(String(days), 10) || 30));
    const sinceTs = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);

    const query = `
      SELECT
        s.provider as provider,
        COUNT(DISTINCT s.id) as service_count,
        COUNT(DISTINCT uh.metric) as metric_count,
        SUM(uh.value) as total_usage,
        AVG(uh.value) as avg_usage,
        MAX(uh.value) as peak_usage,
        COUNT(*) as data_points
      FROM usage_history uh
      JOIN services s ON uh.service_id = s.id
      WHERE uh.ts >= ?
      GROUP BY s.provider
      ORDER BY total_usage DESC
    `;

    const providers = await db.all(query, [sinceTs]);

    res.json({
      providers,
      days: daysNum,
      generatedAt: nowTs(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching provider comparison");
    res.status(500).json({ error: "Failed to fetch provider comparison" });
  }
});

export default router;
