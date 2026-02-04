import { Schema as S } from "effect";
import { UsageAnalytics, ProviderAnalytics } from "../schemas/analytics.ts";

// GET /api/analytics
export const AnalyticsResponse = UsageAnalytics;
export type AnalyticsResponse = S.Schema.Type<typeof AnalyticsResponse>;

// GET /api/analytics/providers
export const ProviderAnalyticsResponse = ProviderAnalytics;
export type ProviderAnalyticsResponse = S.Schema.Type<typeof ProviderAnalyticsResponse>;
