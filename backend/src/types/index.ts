// Re-export all types from shared package
export type {
  AIProvider,
  AIService,
  UsageQuota,
  UsageHistory,
  ServiceStatus,
  MetricFormat,
  MetricAnnotation,
  ReplenishmentRate,
  QuotaType,
  TimeSeriesData,
  AnalyticsSummary,
  QuotaWithService,
  UsageAnalytics,
  ProviderComparison,
  ProviderAnalytics,
} from "shared";

// Re-export schemas for runtime validation
export {
  AIProvider as AIProviderSchema,
  AIService as AIServiceSchema,
  UsageQuota as UsageQuotaSchema,
  UsageHistory as UsageHistorySchema,
  ServiceStatus as ServiceStatusSchema,
} from "shared/schemas";

// Backend-only types (not shared with frontend)
export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  quotaEndpoints?: {
    usage?: string;
    limits?: string;
  };
  headers?: Record<string, string>;
}
