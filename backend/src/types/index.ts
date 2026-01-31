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
}

export interface UsageHistory {
  id: string;
  serviceId: string;
  metric: string;
  value: number;
  ts: number; // unix seconds
}

export interface ServiceStatus {
  service: AIService;
  quotas: UsageQuota[];
  lastUpdated: number; // unix seconds
  isHealthy: boolean;
  error?: string;
  authError?: boolean;
}

export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "aws"
  | "opencode"
  | "amp"
  | "zai"
  | "codex";

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

export interface ProviderConfig {
  name: string;
  baseUrl?: string; // Optional - some providers have fixed endpoints (e.g., Codex)
  quotaEndpoints?: {
    usage?: string;
    limits?: string;
  };
  headers?: Record<string, string>;
}
