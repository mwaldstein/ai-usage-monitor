import type { MetricAnnotation } from "./index";

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
 * All provider metric definitions combined
 */
export const ALL_METRIC_DEFINITIONS: Record<string, Record<string, MetricAnnotation>> = {
  amp: AMP_METRIC_DEFINITIONS,
  zai: ZAI_METRIC_DEFINITIONS,
  opencode: OPENCODE_METRIC_DEFINITIONS,
  codex: CODEX_METRIC_DEFINITIONS,
};

/**
 * Get metric annotation for a specific provider and metric name
 * First checks for exact match, then falls back to pattern matching
 * Returns undefined if no definition exists
 */
export function getMetricAnnotation(
  provider: string,
  metric: string,
): MetricAnnotation | undefined {
  const providerDefs = ALL_METRIC_DEFINITIONS[provider.toLowerCase()];
  if (!providerDefs) return undefined;

  // Direct match
  if (providerDefs[metric]) {
    return providerDefs[metric];
  }

  // Pattern matching for dynamic metrics
  if (provider === "amp" || provider === "AMP") {
    // Handle dynamic bucket names like "ubi_quota", "xyz_quota"
    if (metric.endsWith("_quota")) {
      const bucket = metric.replace("_quota", "");
      const baseDef = providerDefs["ubi_quota"];
      if (baseDef) {
        return {
          ...baseDef,
          displayName: `${bucket.toUpperCase()} Quota`,
        };
      }
    }
  }

  if (provider === "zai" || provider === "ZAI" || provider === "z.ai") {
    // Handle dynamic rate limit windows
    if (metric.startsWith("requests_per_") && metric.endsWith("min_window")) {
      const minutes = metric.replace("requests_per_", "").replace("min_window", "");
      const baseDef = providerDefs["requests_per_1min_window"];
      if (baseDef) {
        return {
          ...baseDef,
          displayName: `Requests (${minutes} min)`,
        };
      }
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
  }

  return undefined;
}

/**
 * Get effective metric annotation, merging metadata from the quota with local definitions
 * This allows the backend to override local defaults if needed
 */
export function getEffectiveMetricAnnotation(
  provider: string,
  metric: string,
  metadata?: MetricAnnotation,
): MetricAnnotation {
  // If backend provided metadata, use it as the base
  if (metadata) {
    return metadata;
  }

  // Otherwise fall back to local definitions
  const localDef = getMetricAnnotation(provider, metric);
  if (localDef) {
    return localDef;
  }

  // Final fallback: default annotation
  return {
    format: "decimal",
    displayName: metric.replace(/_/g, " "),
    priority: 1000,
    warnWhenLow: false,
    precision: 1,
  };
}

/**
 * Format a value according to metric annotation
 */
export function formatMetricValue(value: number, annotation: MetricAnnotation): string {
  switch (annotation.format) {
    case "currency": {
      const symbol = annotation.currencySymbol || "$";
      return `${symbol}${value.toFixed(annotation.precision ?? 2)}`;
    }
    case "percentage": {
      return `${value.toFixed(annotation.precision ?? 1)}%`;
    }
    case "integer": {
      if (annotation.notation === "compact" && Math.abs(value) >= 1000) {
        return new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value);
      }
      if (annotation.notation === "scientific" && Math.abs(value) >= 10000) {
        return value.toExponential(2);
      }
      return Math.round(value).toLocaleString();
    }
    case "scientific": {
      return value.toExponential(annotation.precision ?? 2);
    }
    case "decimal":
    default: {
      return value.toFixed(annotation.precision ?? 1);
    }
  }
}

/**
 * Get display name for a metric
 */
export function getMetricDisplayName(
  provider: string,
  metric: string,
  metadata?: MetricAnnotation,
): string {
  const annotation = getEffectiveMetricAnnotation(provider, metric, metadata);
  return annotation.displayName || metric.replace(/_/g, " ");
}
