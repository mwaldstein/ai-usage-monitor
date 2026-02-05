import { Schema as S } from "effect";
import { LogEntry } from "../schemas/logs.ts";

// Query: /api/logs
export const LogsQuery = S.Struct({
  limit: S.optional(S.String),
});
export type LogsQuery = S.Schema.Type<typeof LogsQuery>;

// GET /api/logs
export const LogsResponse = S.Struct({
  entries: S.Array(LogEntry),
});
export type LogsResponse = S.Schema.Type<typeof LogsResponse>;
