import { Schema as S } from "effect";
import { UsageAnalytics, ProviderAnalytics } from "../schemas/analytics.ts";

// Query: /api/usage/analytics
export const AnalyticsQuery = S.Struct({
  days: S.optional(S.String),
  serviceId: S.optional(S.String),
  interval: S.optional(S.String),
  groupBy: S.optional(S.Literal("service", "provider", "metric")),
});
export type AnalyticsQuery = S.Schema.Type<typeof AnalyticsQuery>;

// GET /api/analytics
export const AnalyticsResponse = UsageAnalytics;
export type AnalyticsResponse = S.Schema.Type<typeof AnalyticsResponse>;

// Query: /api/usage/analytics/providers
export const ProviderAnalyticsQuery = S.Struct({
  days: S.optional(S.String),
});
export type ProviderAnalyticsQuery = S.Schema.Type<typeof ProviderAnalyticsQuery>;

// GET /api/analytics/providers
export const ProviderAnalyticsResponse = ProviderAnalytics;
export type ProviderAnalyticsResponse = S.Schema.Type<typeof ProviderAnalyticsResponse>;
