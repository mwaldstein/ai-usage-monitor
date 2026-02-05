import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../database/index.ts";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import {
  AnalyticsQuery,
  AnalyticsResponse,
  ApiError,
  ProviderAnalyticsQuery,
  ProviderAnalyticsResponse,
} from "shared/api";

const router = Router();

type ParseResult = { ok: true; value: number } | { ok: false; error: string };

function parseBoundedInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  field: string,
): ParseResult {
  if (value === undefined) {
    return { ok: true, value: defaultValue };
  }

  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return { ok: false, error: `${field} must be a positive integer` };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < min || parsed > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}` };
  }

  return { ok: true, value: parsed };
}

type IntervalParseResult =
  | { ok: true; raw: string; intervalSeconds: number }
  | { ok: false; error: string };

function parseInterval(value: string | undefined): IntervalParseResult {
  const raw = (value ?? "1h").trim();
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    return { ok: false, error: "interval must match <number><m|h|d>" };
  }

  const amount = Number.parseInt(match[1], 10);
  if (amount <= 0) {
    return { ok: false, error: "interval must be greater than 0" };
  }

  const unit = match[2];
  const intervalMinutes = amount * (unit === "d" ? 1440 : unit === "h" ? 60 : 1);
  return { ok: true, raw, intervalSeconds: intervalMinutes * 60 };
}

router.get("/", async (req, res) => {
  try {
    const decodedQuery = S.decodeUnknownEither(AnalyticsQuery)(req.query);
    if (Either.isLeft(decodedQuery)) {
      return res.status(400).json(
        S.encodeSync(ApiError)({
          error: "Invalid query parameters",
          details: decodedQuery.left,
        }),
      );
    }

    const { days, serviceId, interval, groupBy } = decodedQuery.right;
    if (serviceId !== undefined && serviceId.trim().length === 0) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: "serviceId must be non-empty" }));
    }

    const daysResult = parseBoundedInt(days, 30, 1, 365, "days");
    if (!daysResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: daysResult.error }));
    }

    const intervalResult = parseInterval(interval);
    if (!intervalResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: intervalResult.error }));
    }

    const groupByValue = groupBy ?? "service";
    const db = getDatabase();

    const daysNum = daysResult.value;
    const sinceTs = Math.floor((Date.now() - daysNum * 24 * 60 * 60 * 1000) / 1000);

    logger.info(
      { days: daysNum, interval: intervalResult.raw, groupBy: groupByValue, sinceTs },
      "API /usage/analytics request",
    );

    const intervalSeconds = intervalResult.intervalSeconds;
    const timeBucket = `(uh.ts / ${intervalSeconds}) * ${intervalSeconds}`;

    const groupByColumn = groupByValue;
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

    const timeSeriesRaw = await db.all(timeSeriesQuery, params);
    const timeSeries = timeSeriesRaw.map((row) => ({
      service_name: String(row.service_name),
      provider: String(row.provider),
      serviceId: String(row.serviceId),
      metric: String(row.metric),
      ts: Number(row.ts),
      avg_value: Number(row.avg_value),
      min_value: Number(row.min_value),
      max_value: Number(row.max_value),
      data_points: Number(row.data_points),
    }));

    const quotasQuery = `
      SELECT * FROM (
        SELECT
          q.service_id as serviceId,
          q.metric as metric,
          COALESCE(q.raw_limit_value, q.limit_value) as "limit",
          COALESCE(q.raw_used_value, q.used_value) as used,
          q.type as type,
          s.name as service_name,
          s.provider as provider,
          ROW_NUMBER() OVER (
            PARTITION BY q.service_id, q.metric
            ORDER BY q.rowid DESC
          ) AS rn
        FROM quotas q
        JOIN services s ON q.service_id = s.id
        WHERE s.enabled = 1
      )
      WHERE rn = 1
    `;

    const quotas = serviceId
      ? await db.all(quotasQuery + " AND serviceId = ?", [serviceId])
      : await db.all(quotasQuery);
    const normalizedQuotas = quotas
      .map((quota) => {
        const limit = Number(quota.limit);
        const used = Number(quota.used);

        // Prevent NaN/Infinity from being serialized as null in JSON.
        if (!Number.isFinite(limit) || !Number.isFinite(used)) {
          logger.warn(
            {
              serviceId: quota.serviceId,
              metric: quota.metric,
              limit: quota.limit,
              used: quota.used,
            },
            "Skipping non-finite quota values in analytics response",
          );
          return null;
        }

        return {
          serviceId: String(quota.serviceId),
          metric: String(quota.metric),
          limit,
          used,
          type: quota.type ?? undefined,
          service_name: String(quota.service_name),
          provider: String(quota.provider),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

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

    const summaryRaw = await db.all(summaryQuery, summaryParams);
    const summary = summaryRaw.map((row) => ({
      service_name: String(row.service_name),
      provider: String(row.provider),
      serviceId: String(row.serviceId),
      metric: String(row.metric),
      min_value: Number(row.min_value),
      max_value: Number(row.max_value),
      avg_value: Number(row.avg_value),
      total_consumed: Number(row.total_consumed),
      first_record_ts: Number(row.first_record_ts),
      last_record_ts: Number(row.last_record_ts),
      active_days: Number(row.active_days),
    }));

    res.json(
      S.encodeSync(AnalyticsResponse)({
        timeSeries,
        quotas: normalizedQuotas,
        summary,
        days: daysNum,
        generatedAt: nowTs(),
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching usage analytics");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch usage analytics" }));
  }
});

router.get("/providers", async (req, res) => {
  try {
    const decodedQuery = S.decodeUnknownEither(ProviderAnalyticsQuery)(req.query);
    if (Either.isLeft(decodedQuery)) {
      return res.status(400).json(
        S.encodeSync(ApiError)({
          error: "Invalid query parameters",
          details: decodedQuery.left,
        }),
      );
    }

    const { days } = decodedQuery.right;
    const db = getDatabase();

    const daysResult = parseBoundedInt(days, 30, 1, 365, "days");
    if (!daysResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: daysResult.error }));
    }

    const daysNum = daysResult.value;
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

    const providersRaw = await db.all(query, [sinceTs]);
    const providers = providersRaw.map((row) => ({
      provider: String(row.provider),
      service_count: Number(row.service_count),
      metric_count: Number(row.metric_count),
      total_usage: Number(row.total_usage),
      avg_usage: Number(row.avg_usage),
      peak_usage: Number(row.peak_usage),
      data_points: Number(row.data_points),
    }));

    res.json(
      S.encodeSync(ProviderAnalyticsResponse)({
        providers,
        days: daysNum,
        generatedAt: nowTs(),
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching provider comparison");
    res.status(500).json(S.encodeSync(ApiError)({ error: "Failed to fetch provider comparison" }));
  }
});

export default router;
