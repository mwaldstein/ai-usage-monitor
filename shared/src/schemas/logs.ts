import { Schema as S } from "effect";

export const LogLevel = S.Union(
  S.Literal("trace"),
  S.Literal("debug"),
  S.Literal("info"),
  S.Literal("warn"),
  S.Literal("error"),
  S.Literal("fatal"),
);
export type LogLevel = S.Schema.Type<typeof LogLevel>;

export const LogEntry = S.Struct({
  ts: S.Number,
  level: LogLevel,
  message: S.String,
  details: S.optional(S.String),
});
export type LogEntry = S.Schema.Type<typeof LogEntry>;
