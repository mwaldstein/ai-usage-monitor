import { Schema as S } from "effect";

export const AMPRemoteResultEnvelope = S.Struct({
  type: S.Literal("result"),
  result: S.String,
});
export type AMPRemoteResultEnvelope = S.Schema.Type<typeof AMPRemoteResultEnvelope>;

export const AMPQuotaResultTuple = S.Tuple(
  S.Unknown,
  S.String,
  S.Number,
  S.Number,
  S.String,
  S.Number,
);
export type AMPQuotaResultTuple = S.Schema.Type<typeof AMPQuotaResultTuple>;

export const AMPPaidBalanceResult = S.Union(S.Number, S.Tuple(S.Number));
export type AMPPaidBalanceResult = S.Schema.Type<typeof AMPPaidBalanceResult>;

export const OpenCodeUsage = S.Struct({
  status: S.String,
  resetInSec: S.Number,
  usagePercent: S.Number,
});
export type OpenCodeUsage = S.Schema.Type<typeof OpenCodeUsage>;

export const OpenCodeSubscription = S.Struct({
  plan: S.String,
  useBalance: S.Boolean,
  rollingUsage: S.NullOr(OpenCodeUsage),
  weeklyUsage: S.NullOr(OpenCodeUsage),
});
export type OpenCodeSubscription = S.Schema.Type<typeof OpenCodeSubscription>;

export const OpenCodeBilling = S.Struct({
  customerID: S.String,
  balance: S.Number,
  monthlyLimit: S.NullOr(S.Number),
  monthlyUsage: S.Number,
  timeMonthlyUsageUpdated: S.String,
  subscription: S.Struct({
    plan: S.String,
    seats: S.Number,
    status: S.String,
  }),
  subscriptionID: S.String,
});
export type OpenCodeBilling = S.Schema.Type<typeof OpenCodeBilling>;

export const CodexWindow = S.Struct({
  used_percent: S.Number,
  limit_window_seconds: S.Number,
  reset_after_seconds: S.Number,
  reset_at: S.Number,
});
export type CodexWindow = S.Schema.Type<typeof CodexWindow>;

export const CodexRateLimit = S.Struct({
  allowed: S.Boolean,
  limit_reached: S.Boolean,
  primary_window: CodexWindow,
  secondary_window: CodexWindow,
});
export type CodexRateLimit = S.Schema.Type<typeof CodexRateLimit>;

export const CodexCodeReviewRateLimit = S.Struct({
  allowed: S.Boolean,
  limit_reached: S.Boolean,
  primary_window: CodexWindow,
  secondary_window: S.NullOr(CodexWindow),
});
export type CodexCodeReviewRateLimit = S.Schema.Type<typeof CodexCodeReviewRateLimit>;

export const CodexCredits = S.Struct({
  has_credits: S.Boolean,
  unlimited: S.Boolean,
  balance: S.NullOr(S.Union(S.Number, S.String)),
  approx_local_messages: S.NullOr(S.Union(S.Number, S.Array(S.Number))),
  approx_cloud_messages: S.NullOr(S.Union(S.Number, S.Array(S.Number))),
});
export type CodexCredits = S.Schema.Type<typeof CodexCredits>;

export const CodexAdditionalRateLimit = S.Struct({
  limit_name: S.String,
  metered_feature: S.String,
  rate_limit: CodexRateLimit,
});
export type CodexAdditionalRateLimit = S.Schema.Type<typeof CodexAdditionalRateLimit>;

export const CodexUsageResponse = S.Struct({
  plan_type: S.String,
  rate_limit: CodexRateLimit,
  code_review_rate_limit: CodexCodeReviewRateLimit,
  additional_rate_limits: S.optional(S.NullOr(S.Array(CodexAdditionalRateLimit))),
  credits: CodexCredits,
});
export type CodexUsageResponse = S.Schema.Type<typeof CodexUsageResponse>;

export const ClaudeUsageWindow = S.Struct({
  utilization: S.Number,
  resets_at: S.String,
});
export type ClaudeUsageWindow = S.Schema.Type<typeof ClaudeUsageWindow>;

export const ClaudeExtraUsage = S.Struct({
  is_enabled: S.Boolean,
  monthly_limit: S.NullOr(S.Number),
  used_credits: S.NullOr(S.Number),
  utilization: S.NullOr(S.Number),
});
export type ClaudeExtraUsage = S.Schema.Type<typeof ClaudeExtraUsage>;

export const ClaudeUsageResponse = S.Struct({
  five_hour: S.NullOr(ClaudeUsageWindow),
  seven_day: S.NullOr(ClaudeUsageWindow),
  seven_day_oauth_apps: S.NullOr(ClaudeUsageWindow),
  seven_day_opus: S.NullOr(ClaudeUsageWindow),
  seven_day_sonnet: S.NullOr(ClaudeUsageWindow),
  seven_day_cowork: S.NullOr(ClaudeUsageWindow),
  iguana_necktie: S.NullOr(ClaudeUsageWindow),
  extra_usage: S.NullOr(ClaudeExtraUsage),
});
export type ClaudeUsageResponse = S.Schema.Type<typeof ClaudeUsageResponse>;

export const ZAIUsageDetail = S.Struct({
  modelCode: S.String,
  usage: S.Number,
});
export type ZAIUsageDetail = S.Schema.Type<typeof ZAIUsageDetail>;

/**
 * Z.ai quota limit response structure.
 *
 * Field semantics (reverse-engineered from frontend code):
 * - `type`: "TOKENS_LIMIT" or "TIME_LIMIT" - determines which quota category
 * - `unit`: Enum identifier (3, 5, 6) used with `type` to match quota definitions:
 *   - unit: 3 + TOKENS_LIMIT = "5 Hours Quota" (tokens for GLM models)
 *   - unit: 6 + TOKENS_LIMIT = "Weekly Quota" (weekly token limit)
 *   - unit: 5 + TIME_LIMIT = "Monthly Web Search/Reader/Zread Quota"
 * - `number`: Redundant matching key that mirrors `unit` value. Not used in display
 *   logic by the frontend - appears to be legacy or internal identifier.
 * - `usage`, `currentValue`, `remaining`: Only populated for TIME_LIMIT (actual
 *   request counts). For TOKENS_LIMIT, these are undefined.
 * - `percentage`: Primary value for TOKENS_LIMIT (0-100). For TIME_LIMIT, also
 *   available but absolute values are preferred.
 * - `nextResetTime`: Unix timestamp (ms) for when quota resets.
 * - `usageDetails`: Model breakdown for TIME_LIMIT (e.g., search-prime, web-reader).
 *
 * Important: The z.ai API intentionally only exposes percentage for token usage,
 * not absolute numbers. The actual token limits are not retrievable via this API.
 */
export const ZAIQuotaLimit = S.Struct({
  type: S.String,
  unit: S.Number,
  number: S.Number,
  usage: S.optional(S.Number),
  currentValue: S.optional(S.Number),
  remaining: S.optional(S.Number),
  percentage: S.optional(S.Number),
  nextResetTime: S.optional(S.Number),
  usageDetails: S.optional(S.Array(ZAIUsageDetail)),
});
export type ZAIQuotaLimit = S.Schema.Type<typeof ZAIQuotaLimit>;

export const ZAIQuotaResponse = S.Struct({
  code: S.Number,
  msg: S.String,
  data: S.Struct({
    limits: S.Array(ZAIQuotaLimit),
  }),
});
export type ZAIQuotaResponse = S.Schema.Type<typeof ZAIQuotaResponse>;

export const ZAISubscription = S.Struct({
  id: S.String,
  customerId: S.String,
  agreementNo: S.String,
  productId: S.String,
  productName: S.String,
  description: S.String,
  status: S.String,
  purchaseTime: S.String,
  valid: S.String,
  autoRenew: S.Number,
  initialPrice: S.Number,
  standardPrice: S.Number,
  billingCycle: S.String,
  paymentChannel: S.String,
});
export type ZAISubscription = S.Schema.Type<typeof ZAISubscription>;

export const ZAISubscriptionResponse = S.Struct({
  code: S.Number,
  msg: S.String,
  data: S.Array(ZAISubscription),
});
export type ZAISubscriptionResponse = S.Schema.Type<typeof ZAISubscriptionResponse>;
