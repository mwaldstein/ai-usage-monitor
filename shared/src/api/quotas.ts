import { Schema as S } from "effect";
import { ServiceStatus } from "../schemas/status.ts";
import { UsageQuota } from "../schemas/quota.ts";

// GET /api/quotas - Get current quotas
export const QuotasResponse = S.Array(UsageQuota);
export type QuotasResponse = S.Schema.Type<typeof QuotasResponse>;

// POST /api/quotas/refresh - Force refresh
export const RefreshQuotasResponse = S.Array(ServiceStatus);
export type RefreshQuotasResponse = S.Schema.Type<typeof RefreshQuotasResponse>;

// Params: /api/quotas/refresh/:serviceId
export const RefreshQuotasParams = S.Struct({
  serviceId: S.String,
});
export type RefreshQuotasParams = S.Schema.Type<typeof RefreshQuotasParams>;
