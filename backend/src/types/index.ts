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
  type?: "usage" | "credits" | "rate_limit"; // usage = burn down (shows remaining), credits = balance (shows remaining), rate_limit = shows used/limit
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

export interface ProviderConfig {
  name: string;
  baseUrl?: string; // Optional - some providers have fixed endpoints (e.g., Codex)
  quotaEndpoints?: {
    usage?: string;
    limits?: string;
  };
  headers?: Record<string, string>;
}
