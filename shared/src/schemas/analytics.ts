import { Schema as S } from "effect";
import { QuotaType } from "./quota.ts";

export const TimeSeriesData = S.Struct({
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
export type TimeSeriesData = S.Schema.Type<typeof TimeSeriesData>;

export const AnalyticsSummary = S.Struct({
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
export type AnalyticsSummary = S.Schema.Type<typeof AnalyticsSummary>;

export const QuotaWithService = S.Struct({
  serviceId: S.String,
  metric: S.String,
  limit: S.Number,
  used: S.Number,
  type: S.optional(QuotaType),
  service_name: S.String,
  provider: S.String,
});
export type QuotaWithService = S.Schema.Type<typeof QuotaWithService>;

export const UsageAnalytics = S.Struct({
  timeSeries: S.Array(TimeSeriesData),
  quotas: S.Array(QuotaWithService),
  summary: S.Array(AnalyticsSummary),
  days: S.Number,
  generatedAt: S.Number, // unix seconds
});
export type UsageAnalytics = S.Schema.Type<typeof UsageAnalytics>;

export const ProviderComparison = S.Struct({
  provider: S.String,
  service_count: S.Number,
  metric_count: S.Number,
  total_usage: S.Number,
  avg_usage: S.Number,
  peak_usage: S.Number,
  data_points: S.Number,
});
export type ProviderComparison = S.Schema.Type<typeof ProviderComparison>;

export const ProviderAnalytics = S.Struct({
  providers: S.Array(ProviderComparison),
  days: S.Number,
  generatedAt: S.Number, // unix seconds
});
export type ProviderAnalytics = S.Schema.Type<typeof ProviderAnalytics>;
