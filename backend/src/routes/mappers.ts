import { Schema as S, Either } from "effect";
import type { AIService, UsageQuota } from "../types/index.ts";
import { AIProviderSchema } from "../types/index.ts";
import { QuotaType, ReplenishmentPeriod } from "shared/schemas";

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function decodeOrUndefined<To, From>(
  schema: S.Schema<To, From, never>,
  value: unknown,
): To | undefined {
  const decoded = S.decodeUnknownEither(schema)(value);
  return Either.isRight(decoded) ? decoded.right : undefined;
}

function decodeProvider(value: unknown): AIService["provider"] {
  const decoded = S.decodeUnknownEither(AIProviderSchema)(value);
  if (Either.isRight(decoded)) return decoded.right;

  // Defensive fallback: DB should only contain valid provider values.
  return "codex";
}

function mapDerivedQuotaValues(row: Record<string, unknown>): {
  limit: number;
  used: number;
  remaining: number;
} {
  const limit = toFiniteNumber(row.raw_limit_value, toFiniteNumber(row.limit_value, 0));
  const used = toFiniteNumber(row.raw_used_value, toFiniteNumber(row.used_value, 0));
  const remaining = toFiniteNumber(row.raw_remaining_value, toFiniteNumber(row.remaining_value, 0));

  return { limit, used, remaining };
}

export function mapServiceRow(row: unknown): AIService {
  const r = row as Record<string, unknown>;
  return {
    id: toNonEmptyString(r.id),
    name: toNonEmptyString(r.name),
    provider: decodeProvider(r.provider),
    apiKey: typeof r.api_key === "string" ? r.api_key : undefined,
    bearerToken: typeof r.bearer_token === "string" ? r.bearer_token : undefined,
    baseUrl: typeof r.base_url === "string" ? r.base_url : undefined,
    enabled: r.enabled === 1 || r.enabled === true,
    displayOrder: toFiniteNumber(r.display_order, 0),
    createdAt: toFiniteNumber(r.created_at, 0),
    updatedAt: toFiniteNumber(r.updated_at, 0),
  };
}

export function mapQuotaRow(row: unknown): UsageQuota {
  const r = row as Record<string, unknown>;
  const quotaType = decodeOrUndefined(QuotaType, r.type);
  const replenishmentPeriod = decodeOrUndefined(ReplenishmentPeriod, r.replenishment_period);
  const values = mapDerivedQuotaValues(r);

  return {
    id: toNonEmptyString(r.id),
    serviceId: toNonEmptyString(r.service_id),
    metric: toNonEmptyString(r.metric),
    limit: values.limit,
    used: values.used,
    remaining: values.remaining,
    resetAt: toFiniteNumber(r.reset_at, 0),
    createdAt: toFiniteNumber(r.created_at, 0),
    updatedAt: toFiniteNumber(r.updated_at, 0),
    type: quotaType,
    replenishmentRate:
      typeof r.replenishment_amount === "number" && Number.isFinite(r.replenishment_amount)
        ? {
            amount: r.replenishment_amount,
            period: replenishmentPeriod ?? "day",
          }
        : undefined,
  };
}
