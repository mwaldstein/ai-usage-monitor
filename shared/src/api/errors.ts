import { Schema as S } from "effect";

export const ApiError = S.Struct({
  error: S.String,
  details: S.optional(S.Unknown),
});
export type ApiError = S.Schema.Type<typeof ApiError>;
