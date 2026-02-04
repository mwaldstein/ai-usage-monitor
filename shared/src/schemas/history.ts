import { Schema as S } from "effect";

export const UsageHistory = S.Struct({
  id: S.optional(S.String),
  serviceId: S.String,
  metric: S.String,
  value: S.Number,
  ts: S.Number, // unix seconds
  service_name: S.String,
});
export type UsageHistory = S.Schema.Type<typeof UsageHistory>;
