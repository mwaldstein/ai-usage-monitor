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

export interface TimeSeriesData {
  service_name: string;
  provider: string;
  serviceId: string;
  metric: string;
  timestamp: string;
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
  first_record: string;
  last_record: string;
  active_days: number;
}

export interface QuotaWithService {
  serviceId: string;
  metric: string;
  limit: number;
  used: number;
  type?: 'usage' | 'credits' | 'rate_limit';
  service_name: string;
  provider: string;
}

export interface UsageAnalytics {
  timeSeries: TimeSeriesData[];
  quotas: QuotaWithService[];
  summary: AnalyticsSummary[];
  days: number;
  generatedAt: string;
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
  generatedAt: string;
}
