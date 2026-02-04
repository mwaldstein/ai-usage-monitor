import { Schema as S } from "effect";

export const ReplenishmentPeriod = S.Literal("hour", "day", "minute");
export type ReplenishmentPeriod = S.Schema.Type<typeof ReplenishmentPeriod>;

export const ReplenishmentRate = S.Struct({
  amount: S.Number,
  period: ReplenishmentPeriod,
});
export type ReplenishmentRate = S.Schema.Type<typeof ReplenishmentRate>;

export const QuotaType = S.Literal("usage", "credits", "rate_limit");
export type QuotaType = S.Schema.Type<typeof QuotaType>;

export const MetricFormat = S.Literal("currency", "percentage", "integer", "decimal", "scientific");
export type MetricFormat = S.Schema.Type<typeof MetricFormat>;

export const MetricNotation = S.Literal("standard", "scientific", "compact");
export type MetricNotation = S.Schema.Type<typeof MetricNotation>;

export const MetricAnnotation = S.Struct({
  format: MetricFormat,
  displayName: S.String,
  currencySymbol: S.optional(S.String),
  precision: S.optional(S.Number),
  priority: S.Number,
  warnWhenLow: S.Boolean,
  warnThreshold: S.optional(S.Number),
  errorThreshold: S.optional(S.Number),
  notation: S.optional(MetricNotation),
});
export type MetricAnnotation = S.Schema.Type<typeof MetricAnnotation>;

export const UsageQuota = S.Struct({
  id: S.String,
  serviceId: S.String,
  metric: S.String,
  limit: S.Number,
  used: S.Number,
  remaining: S.Number,
  resetAt: S.Number, // unix seconds
  createdAt: S.Number, // unix seconds
  updatedAt: S.Number, // unix seconds
  replenishmentRate: S.optional(ReplenishmentRate),
  type: S.optional(QuotaType),
  metricMetadata: S.optional(MetricAnnotation),
});
export type UsageQuota = S.Schema.Type<typeof UsageQuota>;
