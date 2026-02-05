import { Schema as S } from "effect";

export const EmptyAuthQuerySchema = S.Struct({});

export const UsernameRequestSchema = S.Struct({
  username: S.String,
});

export const UserIdRequestSchema = S.Struct({
  userId: S.String,
});

export const SessionIdRequestSchema = S.Struct({
  sessionId: S.String,
});

export const ApiKeyHashRequestSchema = S.Struct({
  keyHash: S.String,
});

export const ApiKeyByUserRequestSchema = S.Struct({
  userId: S.String,
  apiKeyId: S.String,
});

export const SessionLookupRequestSchema = S.Struct({
  sessionId: S.String,
  now: S.Number,
});

export const SessionPurgeRequestSchema = S.Struct({
  userId: S.String,
  now: S.Number,
});

export const SessionDeleteOtherRequestSchema = S.Struct({
  userId: S.String,
  keepSessionId: S.String,
});

export const UserCountRowSchema = S.Struct({
  count: S.Number,
});

export const UserIdRowSchema = S.Struct({
  id: S.String,
});

export const UserCredentialsRowSchema = S.Struct({
  id: S.String,
  username: S.String,
  password_hash: S.String,
});

export const UserPasswordRowSchema = S.Struct({
  password_hash: S.String,
});

export const UserProfileRowSchema = S.Struct({
  id: S.String,
  username: S.String,
  created_at: S.Number,
});

export const SessionUserRowSchema = S.Struct({
  user_id: S.String,
  username: S.String,
});

export const ApiKeyUserRowSchema = S.Struct({
  key_id: S.String,
  user_id: S.String,
  username: S.String,
});

export const ApiKeySummaryRowSchema = S.Struct({
  id: S.String,
  name: S.String,
  key_prefix: S.String,
  created_at: S.Number,
  last_used_at: S.NullOr(S.Number),
});

export const UserInsertRequestSchema = S.Struct({
  id: S.String,
  username: S.String,
  passwordHash: S.String,
  createdAt: S.Number,
  updatedAt: S.Number,
});

export const SessionInsertRequestSchema = S.Struct({
  id: S.String,
  userId: S.String,
  expiresAt: S.Number,
  createdAt: S.Number,
});

export const UserPasswordUpdateRequestSchema = S.Struct({
  userId: S.String,
  passwordHash: S.String,
  updatedAt: S.Number,
});

export const ApiKeyInsertRequestSchema = S.Struct({
  id: S.String,
  userId: S.String,
  name: S.String,
  keyHash: S.String,
  keyPrefix: S.String,
  createdAt: S.Number,
});

export const ApiKeyTouchRequestSchema = S.Struct({
  apiKeyId: S.String,
  lastUsedAt: S.Number,
});
