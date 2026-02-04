import { Schema as S } from "effect";
import { AIService } from "./service.ts";
import { UsageQuota } from "./quota.ts";

export const ServiceStatus = S.Struct({
  service: AIService,
  quotas: S.Array(UsageQuota),
  lastUpdated: S.Number, // unix seconds
  isHealthy: S.Boolean,
  error: S.optional(S.String),
  authError: S.optional(S.Boolean),
  tokenExpiration: S.optional(S.Number), // unix seconds
});
export type ServiceStatus = S.Schema.Type<typeof ServiceStatus>;
