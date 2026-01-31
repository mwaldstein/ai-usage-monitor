export interface AIService {
  id: string;
  name: string;
  provider: string;
  apiKey?: string;
  bearerToken?: string; // For providers using Bearer token auth (e.g., Codex)
  baseUrl?: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
}

export type MetricFormat =
  | "currency" // Monetary values (with currencySymbol)
  | "percentage" // Percentage values (0-100)
  | "integer" // Whole numbers (no decimals)
  | "decimal" // Decimal numbers (with precision)
  | "scientific"; // Scientific notation for very large numbers

export interface MetricAnnotation {
  format: MetricFormat;
  displayName: string;
  currencySymbol?: string; // For "currency" format (default: "$")
  precision?: number; // Decimal places for "decimal" format (default: 1)
  priority: number; // Sort order (lower = first, default: 1000)
  warnWhenLow: boolean; // Whether to show warnings when low (default: false)
  warnThreshold?: number; // Warning threshold % (default: 25% for burn-down, 70% for rate-limit)
  errorThreshold?: number; // Error/critical threshold % (default: 10% for burn-down, 90% for rate-limit)
  notation?: "standard" | "scientific" | "compact"; // For large numbers (default: "standard")
}

export interface UsageQuota {
  id: string;
  serviceId: string;
  metric: string;
  limit: number;
  used: number;
  remaining: number;
  resetAt: number; // unix seconds
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
  replenishmentRate?: {
    amount: number;
    period: "hour" | "day" | "minute";
  };
  type?: "usage" | "credits" | "rate_limit";
  metricMetadata?: MetricAnnotation; // Display configuration for this metric
}

export interface ServiceStatus {
  service: AIService;
  quotas: UsageQuota[];
  lastUpdated: number; // unix seconds
  isHealthy: boolean;
  error?: string;
  authError?: boolean;
}

export interface UsageHistory {
  serviceId: string;
  metric: string;
  value: number;
  ts: number;
  service_name: string;
}

export interface TimeSeriesData {
  service_name: string;
  provider: string;
  serviceId: string;
  metric: string;
  ts: number;
  avg_value: number;
  min_value: number;
  max_value: number;
  data_points: number;
}

export interface AnalyticsSummary {
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
}

export interface QuotaWithService {
  serviceId: string;
  metric: string;
  limit: number;
  used: number;
  type?: "usage" | "credits" | "rate_limit";
  service_name: string;
  provider: string;
}

export interface UsageAnalytics {
  timeSeries: TimeSeriesData[];
  quotas: QuotaWithService[];
  summary: AnalyticsSummary[];
  days: number;
  generatedAt: number; // unix seconds
}

export interface ProviderComparison {
  provider: string;
  service_count: number;
  metric_count: number;
  total_usage: number;
  avg_usage: number;
  peak_usage: number;
  data_points: number;
}

export interface ProviderAnalytics {
  providers: ProviderComparison[];
  days: number;
  generatedAt: number; // unix seconds
}
