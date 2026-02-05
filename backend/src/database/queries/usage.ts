import * as SqlSchema from "@effect/sql/SqlSchema";
import * as Effect from "effect/Effect";
import type { DatabaseClient } from "../client.ts";
import { runDbQueryEffect } from "./runtime.ts";
import {
  AnalyticsProviderComparisonRowSchema,
  AnalyticsQuotaRowSchema,
  AnalyticsRawQuerySchema,
  AnalyticsSummaryRowSchema,
  AnalyticsTimeSeriesRowSchema,
  EmptyUsageQuerySchema,
  HistoryRequestSchema,
  HistoryRowSchema,
  LatestQuotaRowSchema,
  QuotaWithServiceRowSchema,
} from "../models/usage.ts";

export async function listHistoryRows(
  db: DatabaseClient,
  request: { sinceTs: number; serviceId: string | null; metric: string | null },
): Promise<
  readonly { serviceId: string; metric: string; value: number; ts: number; service_name: string }[]
> {
  const query = SqlSchema.findAll({
    Request: HistoryRequestSchema,
    Result: HistoryRowSchema,
    execute: ({ sinceTs, serviceId, metric }) => {
      let statement = `
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
      const params: Array<string | number> = [sinceTs];

      if (serviceId) {
        statement += " AND uh.service_id = ?";
        params.push(serviceId);
      }

      if (metric) {
        statement += " AND uh.metric = ?";
        params.push(metric);
      }

      statement += " ORDER BY uh.ts DESC";
      return Effect.tryPromise(() => db.all(statement, params));
    },
  });

  return runDbQueryEffect(query(request));
}

export async function listQuotasWithEnabledServices(db: DatabaseClient): Promise<
  readonly {
    id: string;
    service_id: string;
    metric: string;
    raw_limit_value: number | null;
    raw_used_value: number | null;
    raw_remaining_value: number | null;
    limit_value: number | null;
    used_value: number | null;
    remaining_value: number | null;
    type: string | null;
    replenishment_amount: number | null;
    replenishment_period: string | null;
    reset_at: number | null;
    created_at: number;
    updated_at: number;
    service_name: string;
    provider: string;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: EmptyUsageQuerySchema,
    Result: QuotaWithServiceRowSchema,
    execute: () =>
      Effect.tryPromise(() =>
        db.all(`
          SELECT q.*, s.name as service_name, s.provider
          FROM quotas q
          JOIN services s ON q.service_id = s.id
          WHERE s.enabled = 1
          ORDER BY s.name, q.metric
        `),
      ),
  });

  return runDbQueryEffect(query({}));
}

export async function listLatestQuotasForEnabledServices(db: DatabaseClient): Promise<
  readonly {
    id: string;
    service_id: string;
    metric: string;
    raw_limit_value: number | null;
    raw_used_value: number | null;
    raw_remaining_value: number | null;
    limit_value: number | null;
    used_value: number | null;
    remaining_value: number | null;
    type: string | null;
    replenishment_amount: number | null;
    replenishment_period: string | null;
    reset_at: number | null;
    created_at: number;
    updated_at: number;
    rn: number;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: EmptyUsageQuerySchema,
    Result: LatestQuotaRowSchema,
    execute: () =>
      Effect.tryPromise(() =>
        db.all(`
          SELECT * FROM (
            SELECT q.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY q.service_id, q.metric
                     ORDER BY q.rowid DESC
                   ) AS rn
            FROM quotas q
            JOIN services s ON s.id = q.service_id
            WHERE s.enabled = 1
          )
          WHERE rn = 1
        `),
      ),
  });

  return runDbQueryEffect(query({}));
}

export async function runAnalyticsTimeSeriesQuery(
  db: DatabaseClient,
  request: { query: string; params: Array<string | number> },
): Promise<
  readonly {
    service_name: string;
    provider: string;
    serviceId: string;
    metric: string;
    ts: number;
    avg_value: number;
    min_value: number;
    max_value: number;
    data_points: number;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: AnalyticsRawQuerySchema,
    Result: AnalyticsTimeSeriesRowSchema,
    execute: ({ query, params }) => Effect.tryPromise(() => db.all(query, params)),
  });

  return runDbQueryEffect(query(request));
}

export async function runAnalyticsLatestQuotasQuery(
  db: DatabaseClient,
  request: { query: string; params: Array<string | number> },
): Promise<
  readonly {
    serviceId: string;
    metric: string;
    limit: number;
    used: number;
    type: string | null;
    service_name: string;
    provider: string;
    rn: number;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: AnalyticsRawQuerySchema,
    Result: AnalyticsQuotaRowSchema,
    execute: ({ query, params }) => Effect.tryPromise(() => db.all(query, params)),
  });

  return runDbQueryEffect(query(request));
}

export async function runAnalyticsSummaryQuery(
  db: DatabaseClient,
  request: { query: string; params: Array<string | number> },
): Promise<
  readonly {
    service_name: string;
    provider: string;
    serviceId: string;
    metric: string;
    min_value: number;
    max_value: number;
    avg_value: number;
    total_consumed: number;
    first_record_ts: number;
    last_record_ts: number;
    active_days: number;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: AnalyticsRawQuerySchema,
    Result: AnalyticsSummaryRowSchema,
    execute: ({ query, params }) => Effect.tryPromise(() => db.all(query, params)),
  });

  return runDbQueryEffect(query(request));
}

export async function runAnalyticsProviderComparisonQuery(
  db: DatabaseClient,
  request: { query: string; params: Array<string | number> },
): Promise<
  readonly {
    provider: string;
    service_count: number;
    metric_count: number;
    total_usage: number;
    avg_usage: number;
    peak_usage: number;
    data_points: number;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: AnalyticsRawQuerySchema,
    Result: AnalyticsProviderComparisonRowSchema,
    execute: ({ query, params }) => Effect.tryPromise(() => db.all(query, params)),
  });

  return runDbQueryEffect(query(request));
}
