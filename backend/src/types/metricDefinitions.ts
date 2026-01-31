import type { MetricAnnotation } from "./index.ts";

/**
 * Metric definitions for AMP provider
 * All quota values are in dollars (converted from cents in the API)
 */
export const AMP_METRIC_DEFINITIONS: Record<string, MetricAnnotation> = {
  // Primary quota metric: {bucket}_quota (e.g., ubi_quota)
  ubi_quota: {
    format: "currency",
    displayName: "UBI Quota",
    currencySymbol: "$",
    priority: 10,
    warnWhenLow: true,
    warnThreshold: 25,
    errorThreshold: 10,
  },
  // Billing balance from HTML scraping
  billing_balance: {
    format: "currency",
    displayName: "Account Balance",
    currencySymbol: "$",
    priority: 20,
    warnWhenLow: true,
    warnThreshold: 25,
    errorThreshold: 10,
  },
};

/**
 * Metric definitions for z.ai provider
 * Tokens are large integers that need special formatting
 */
export const ZAI_METRIC_DEFINITIONS: Record<string, MetricAnnotation> = {
  // Primary metric: token consumption (very large numbers)
  tokens_consumption: {
    format: "integer",
    displayName: "Token Consumption",
    priority: 10,
    warnWhenLow: true,
    warnThreshold: 25,
    errorThreshold: 10,
    notation: "compact", // Use compact notation (K, M, B) for readability
  },
  // Rate limits for requests
  requests_per_1min_window: {
    format: "integer",
    displayName: "Requests (1 min)",
    priority: 20,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  requests_per_5min_window: {
    format: "integer",
    displayName: "Requests (5 min)",
    priority: 30,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  requests_per_15min_window: {
    format: "integer",
    displayName: "Requests (15 min)",
    priority: 40,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  requests_per_60min_window: {
    format: "integer",
    displayName: "Requests (60 min)",
    priority: 50,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
};

/**
 * Metric definitions for opencode provider
 * Mix of percentage-based usage and dollar balances
 */
export const OPENCODE_METRIC_DEFINITIONS: Record<string, MetricAnnotation> = {
  // 5-hour rolling window (percentage)
  rolling_5hour_usage: {
    format: "percentage",
    displayName: "5-Hour Usage",
    priority: 10,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Weekly usage (percentage)
  weekly_usage: {
    format: "percentage",
    displayName: "Weekly Usage",
    priority: 20,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Monthly usage (percentage or actual value)
  monthly_usage: {
    format: "percentage",
    displayName: "Monthly Usage",
    priority: 30,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Account balance in dollars (converted from smallest units)
  account_balance: {
    format: "currency",
    displayName: "Account Balance",
    currencySymbol: "$",
    priority: 40,
    warnWhenLow: true,
    warnThreshold: 25,
    errorThreshold: 10,
  },
  // Subscription plan (integer - seat count)
  subscription_plan: {
    format: "integer",
    displayName: "Plan Seats",
    priority: 50,
    warnWhenLow: false,
  },
};

/**
 * Metric definitions for Codex provider
 * Percentage-based usage windows and dollar credits
 */
export const CODEX_METRIC_DEFINITIONS: Record<string, MetricAnnotation> = {
  // 5-hour rolling window (percentage)
  rolling_5hour: {
    format: "percentage",
    displayName: "5-Hour Limit",
    priority: 10,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Weekly usage (percentage)
  weekly: {
    format: "percentage",
    displayName: "Weekly Limit",
    priority: 20,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Code reviews (percentage of weekly allowance)
  code_reviews: {
    format: "percentage",
    displayName: "Code Reviews",
    priority: 30,
    warnWhenLow: false,
    warnThreshold: 70,
    errorThreshold: 90,
  },
  // Paid credits balance
  credits: {
    format: "currency",
    displayName: "Credits Balance",
    currencySymbol: "$",
    priority: 40,
    warnWhenLow: true,
    warnThreshold: 25,
    errorThreshold: 10,
  },
};

/**
 * Get metric annotation for a specific provider and metric name
 * Returns undefined if no definition exists
 */
export function getMetricAnnotation(
  provider: "amp" | "zai" | "opencode" | "codex",
  metric: string,
): MetricAnnotation | undefined {
  switch (provider) {
    case "amp":
      // Handle dynamic bucket names like "ubi_quota", "xyz_quota"
      if (metric.endsWith("_quota")) {
        const bucket = metric.replace("_quota", "");
        return {
          ...AMP_METRIC_DEFINITIONS["ubi_quota"],
          displayName: `${bucket.toUpperCase()} Quota`,
        };
      }
      return AMP_METRIC_DEFINITIONS[metric];
    case "zai":
      // Handle dynamic rate limit windows
      if (metric.startsWith("requests_per_") && metric.endsWith("min_window")) {
        const minutes = metric.replace("requests_per_", "").replace("min_window", "");
        return {
          ...ZAI_METRIC_DEFINITIONS["requests_per_1min_window"],
          displayName: `Requests (${minutes} min)`,
        };
      }
      // Handle dynamic model usage metrics
      if (
        metric.endsWith("_usage") &&
        !metric.startsWith("requests_") &&
        !metric.startsWith("tokens_")
      ) {
        const modelCode = metric.replace("_usage", "");
        return {
          format: "integer",
          displayName: `${modelCode} Usage`,
          priority: 100,
          warnWhenLow: false,
        };
      }
      return ZAI_METRIC_DEFINITIONS[metric];
    case "opencode":
      return OPENCODE_METRIC_DEFINITIONS[metric];
    case "codex":
      return CODEX_METRIC_DEFINITIONS[metric];
    default:
      return undefined;
  }
}
