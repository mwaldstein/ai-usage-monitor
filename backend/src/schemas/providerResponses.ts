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
