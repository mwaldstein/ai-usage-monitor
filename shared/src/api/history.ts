import { Schema as S } from "effect";
import { UsageHistory } from "../schemas/history.ts";

// GET /api/history
export const HistoryResponse = S.Array(UsageHistory);
export type HistoryResponse = S.Schema.Type<typeof HistoryResponse>;
