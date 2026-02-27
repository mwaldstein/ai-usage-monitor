import { Schema as S } from "effect";

export const AIProvider = S.Literal("opencode", "amp", "zai", "codex", "claude");
export type AIProvider = S.Schema.Type<typeof AIProvider>;

export const AIService = S.Struct({
  id: S.String,
  name: S.String,
  provider: AIProvider,
  apiKey: S.optional(S.String),
  bearerToken: S.optional(S.String),
  baseUrl: S.optional(S.String),
  enabled: S.Boolean,
  displayOrder: S.Number,
  createdAt: S.Number, // unix seconds
  updatedAt: S.Number, // unix seconds
  lastError: S.optional(S.String),
  lastErrorKind: S.optional(S.String),
});
export type AIService = S.Schema.Type<typeof AIService>;
