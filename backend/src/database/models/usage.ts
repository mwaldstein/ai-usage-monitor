import { Schema as S } from "effect";

export const EmptyUsageQuerySchema = S.Struct({});

export const HistoryRequestSchema = S.Struct({
  sinceTs: S.Number,
  serviceId: S.NullOr(S.String),
  metric: S.NullOr(S.String),
});

export const HistoryRowSchema = S.Struct({
  serviceId: S.String,
  metric: S.String,
  value: S.Number,
  ts: S.Number,
  service_name: S.String,
});

export const QuotaWithServiceRowSchema = S.Struct({
  id: S.String,
  service_id: S.String,
  metric: S.String,
  raw_limit_value: S.NullOr(S.Number),
  raw_used_value: S.NullOr(S.Number),
  raw_remaining_value: S.NullOr(S.Number),
  limit_value: S.NullOr(S.Number),
  used_value: S.NullOr(S.Number),
  remaining_value: S.NullOr(S.Number),
  type: S.NullOr(S.String),
  replenishment_amount: S.NullOr(S.Number),
  replenishment_period: S.NullOr(S.String),
  reset_at: S.NullOr(S.Number),
  created_at: S.Number,
  updated_at: S.Number,
  service_name: S.String,
  provider: S.String,
});

export const LatestQuotaRowSchema = S.Struct({
  id: S.String,
  service_id: S.String,
  metric: S.String,
  raw_limit_value: S.NullOr(S.Number),
  raw_used_value: S.NullOr(S.Number),
  raw_remaining_value: S.NullOr(S.Number),
  limit_value: S.NullOr(S.Number),
  used_value: S.NullOr(S.Number),
  remaining_value: S.NullOr(S.Number),
  type: S.NullOr(S.String),
  replenishment_amount: S.NullOr(S.Number),
  replenishment_period: S.NullOr(S.String),
  reset_at: S.NullOr(S.Number),
  created_at: S.Number,
  updated_at: S.Number,
  rn: S.Number,
});

export const AnalyticsRawQuerySchema = S.Struct({
  query: S.String,
  params: S.Array(S.Union(S.String, S.Number)),
});

export const AnalyticsTimeSeriesRowSchema = S.Struct({
  service_name: S.String,
  provider: S.String,
  serviceId: S.String,
  metric: S.String,
  ts: S.Number,
  avg_value: S.Number,
  min_value: S.Number,
  max_value: S.Number,
  data_points: S.Number,
});

export const AnalyticsQuotaRowSchema = S.Struct({
  serviceId: S.String,
  metric: S.String,
  limit: S.Number,
  used: S.Number,
  type: S.NullOr(S.String),
  service_name: S.String,
  provider: S.String,
  rn: S.Number,
});

export const AnalyticsSummaryRowSchema = S.Struct({
  service_name: S.String,
  provider: S.String,
  serviceId: S.String,
  metric: S.String,
  min_value: S.Number,
  max_value: S.Number,
  avg_value: S.Number,
  total_consumed: S.Number,
  first_record_ts: S.Number,
  last_record_ts: S.Number,
  active_days: S.Number,
});

export const AnalyticsProviderComparisonRowSchema = S.Struct({
  provider: S.String,
  service_count: S.Number,
  metric_count: S.Number,
  total_usage: S.Number,
  avg_usage: S.Number,
  peak_usage: S.Number,
  data_points: S.Number,
});
