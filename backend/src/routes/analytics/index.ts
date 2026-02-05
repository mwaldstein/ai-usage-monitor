import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import {
  AnalyticsQuery,
  AnalyticsResponse,
  ApiError,
  ProviderAnalyticsQuery,
  ProviderAnalyticsResponse,
} from "shared/api";
import {
  mapProviderComparisonRows,
  mapSummaryRows,
  mapTimeSeriesRows,
  normalizeQuotaRows,
} from "./mappers.ts";
import { buildSinceTs, parseBoundedInt, parseInterval } from "./queryParsers.ts";
import {
  buildLatestQuotasQuery,
  buildProviderComparisonQuery,
  buildSummaryQuery,
  buildTimeSeriesQuery,
} from "./queries.ts";

const router = Router();

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

    const daysNum = daysResult.value;
    const sinceTs = buildSinceTs(daysNum);
    const groupByValue = groupBy ?? "service";
    const db = getDatabase();

    logger.info(
      { days: daysNum, interval: intervalResult.raw, groupBy: groupByValue, sinceTs },
      "API /usage/analytics request",
    );

    const timeSeriesSpec = buildTimeSeriesQuery({
      sinceTs,
      serviceId,
      groupBy: groupByValue,
      intervalSeconds: intervalResult.intervalSeconds,
    });
    const timeSeriesRaw = await db.all(timeSeriesSpec.query, timeSeriesSpec.params);
    const timeSeries = mapTimeSeriesRows(timeSeriesRaw);

    const quotasSpec = buildLatestQuotasQuery(serviceId);
    const quotasRaw = await db.all(quotasSpec.query, quotasSpec.params);
    const quotas = normalizeQuotaRows(quotasRaw, logger);

    const summarySpec = buildSummaryQuery({ sinceTs, serviceId });
    const summaryRaw = await db.all(summarySpec.query, summarySpec.params);
    const summary = mapSummaryRows(summaryRaw);

    res.json(
      S.encodeSync(AnalyticsResponse)({
        timeSeries,
        quotas,
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

    const daysResult = parseBoundedInt(decodedQuery.right.days, 30, 1, 365, "days");
    if (!daysResult.ok) {
      return res.status(400).json(S.encodeSync(ApiError)({ error: daysResult.error }));
    }

    const daysNum = daysResult.value;
    const sinceTs = buildSinceTs(daysNum);
    const db = getDatabase();

    const providerComparisonSpec = buildProviderComparisonQuery(sinceTs);
    const providersRaw = await db.all(providerComparisonSpec.query, providerComparisonSpec.params);
    const providers = mapProviderComparisonRows(providersRaw);

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
