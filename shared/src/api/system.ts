import { Schema as S } from "effect";

// GET /health
export const HealthResponse = S.Struct({
  status: S.Literal("ok"),
  ts: S.Number,
});
export type HealthResponse = S.Schema.Type<typeof HealthResponse>;

// GET /version
export const VersionResponse = S.Struct({
  version: S.String,
  commitSha: S.String,
});
export type VersionResponse = S.Schema.Type<typeof VersionResponse>;
