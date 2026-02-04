import { Schema as S } from "effect";
import { UsageHistory } from "../schemas/history.ts";

// Query: /api/usage/history
export const HistoryQuery = S.Struct({
  serviceId: S.optional(S.String),
  metric: S.optional(S.String),
  hours: S.optional(S.String),
});
export type HistoryQuery = S.Schema.Type<typeof HistoryQuery>;

// GET /api/history
export const HistoryResponse = S.Array(UsageHistory);
export type HistoryResponse = S.Schema.Type<typeof HistoryResponse>;
