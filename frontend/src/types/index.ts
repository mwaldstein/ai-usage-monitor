export interface AIService {
  id: string;
  name: string;
  provider: string;
  apiKey?: string;
  bearerToken?: string;  // For providers using Bearer token auth (e.g., Codex)
  baseUrl?: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UsageQuota {
  id: string;
  serviceId: string;
  metric: string;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  createdAt: string;
  updatedAt: string;
  replenishmentRate?: {
    amount: number;
    period: 'hour' | 'day' | 'minute';
  };
  type?: 'usage' | 'credits' | 'rate_limit';
}

export interface ServiceStatus {
  service: AIService;
  quotas: UsageQuota[];
  lastUpdated: string;
  isHealthy: boolean;
  error?: string;
  authError?: boolean;
}

export interface UsageHistory {
  id: string;
  serviceId: string;
  metric: string;
  value: number;
  timestamp: string;
  service_name: string;
}
