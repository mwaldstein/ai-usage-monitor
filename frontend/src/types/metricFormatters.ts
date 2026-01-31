import type { MetricAnnotation } from "./index";
import { ALL_METRIC_DEFINITIONS } from "./metricDefinitions";

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
