import { Schema as S } from "effect";

// POST /api/auth/register
export const RegisterRequest = S.Struct({
  username: S.String.pipe(S.minLength(3), S.maxLength(64)),
  password: S.String.pipe(S.minLength(8), S.maxLength(128)),
  setupCode: S.String.pipe(S.minLength(1)),
});
export type RegisterRequest = S.Schema.Type<typeof RegisterRequest>;

// POST /api/auth/login
export const LoginRequest = S.Struct({
  username: S.String,
  password: S.String,
});
export type LoginRequest = S.Schema.Type<typeof LoginRequest>;

// POST /api/auth/change-password
export const ChangePasswordRequest = S.Struct({
  currentPassword: S.String,
  newPassword: S.String.pipe(S.minLength(8), S.maxLength(128)),
});
export type ChangePasswordRequest = S.Schema.Type<typeof ChangePasswordRequest>;

// Response for login/register
export const AuthResponse = S.Struct({
  token: S.String,
  user: S.Struct({
    id: S.String,
    username: S.String,
  }),
});
export type AuthResponse = S.Schema.Type<typeof AuthResponse>;

// GET /api/auth/me
export const MeResponse = S.Struct({
  id: S.String,
  username: S.String,
  createdAt: S.Number,
});
export type MeResponse = S.Schema.Type<typeof MeResponse>;

// GET /api/auth/status - public endpoint to check if auth is enabled/setup
export const AuthStatusResponse = S.Struct({
  enabled: S.Boolean,
  hasUsers: S.Boolean,
});
export type AuthStatusResponse = S.Schema.Type<typeof AuthStatusResponse>;

// POST /api/auth/api-keys
export const CreateApiKeyRequest = S.Struct({
  name: S.String.pipe(S.minLength(1), S.maxLength(64)),
});
export type CreateApiKeyRequest = S.Schema.Type<typeof CreateApiKeyRequest>;

// Response includes the raw key (shown once)
export const CreateApiKeyResponse = S.Struct({
  id: S.String,
  name: S.String,
  key: S.String,
  keyPrefix: S.String,
  createdAt: S.Number,
});
export type CreateApiKeyResponse = S.Schema.Type<typeof CreateApiKeyResponse>;

// GET /api/auth/api-keys
export const ApiKeyInfo = S.Struct({
  id: S.String,
  name: S.String,
  keyPrefix: S.String,
  createdAt: S.Number,
  lastUsedAt: S.NullOr(S.Number),
});
export type ApiKeyInfo = S.Schema.Type<typeof ApiKeyInfo>;

export const ListApiKeysResponse = S.Array(ApiKeyInfo);
export type ListApiKeysResponse = S.Schema.Type<typeof ListApiKeysResponse>;

// Params: /api/auth/api-keys/:id
export const ApiKeyIdParams = S.Struct({
  id: S.String,
});
export type ApiKeyIdParams = S.Schema.Type<typeof ApiKeyIdParams>;
