import type { AIService, UsageQuota } from "../types/index.ts";

export function mapServiceRow(row: any): AIService {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key,
    bearerToken: row.bearer_token,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    displayOrder: row.display_order ?? 0,
    createdAt: row.created_at ?? 0,
    updatedAt: row.updated_at ?? 0,
  };
}

export function mapQuotaRow(row: any): UsageQuota {
  return {
    id: row.id,
    serviceId: row.service_id,
    metric: row.metric,
    limit: row.limit_value,
    used: row.used_value,
    remaining: row.remaining_value,
    resetAt: row.reset_at ?? 0,
    createdAt: row.created_at ?? 0,
    updatedAt: row.updated_at ?? 0,
    type: row.type,
    replenishmentRate: row.replenishment_amount
      ? {
          amount: row.replenishment_amount,
          period: row.replenishment_period,
        }
      : undefined,
  };
}
