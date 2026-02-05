import { Schema as S } from "effect";
import type { AIService } from "../../types/index.ts";
import { AIProviderSchema } from "../../types/index.ts";

export const ServiceRowSchema = S.Struct({
  id: S.String,
  name: S.String,
  provider: AIProviderSchema,
  api_key: S.NullOr(S.String),
  bearer_token: S.NullOr(S.String),
  base_url: S.NullOr(S.String),
  enabled: S.Number,
  display_order: S.Number,
  created_at: S.Number,
  updated_at: S.Number,
});

export type ServiceRow = S.Schema.Type<typeof ServiceRowSchema>;

export const EmptyQuerySchema = S.Struct({});

export const ServiceByIdRequestSchema = S.Struct({
  id: S.String,
});

export const EnabledServiceByIdRequestSchema = S.Struct({
  id: S.String,
  enabled: S.Number,
});

export const ServiceInsertRequestSchema = S.Struct({
  id: S.String,
  name: S.String,
  provider: AIProviderSchema,
  apiKey: S.NullOr(S.String),
  bearerToken: S.NullOr(S.String),
  baseUrl: S.NullOr(S.String),
  enabled: S.Number,
  displayOrder: S.Number,
  createdAt: S.Number,
  updatedAt: S.Number,
});

export const ServiceCountRowSchema = S.Struct({
  count: S.Number,
});

export const ServiceUpdateCommandRequestSchema = S.Struct({
  statement: S.String,
  params: S.Array(S.Union(S.String, S.Number, S.Null)),
});

export function mapServiceRowToDomain(row: ServiceRow): AIService {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key ?? undefined,
    bearerToken: row.bearer_token ?? undefined,
    baseUrl: row.base_url ?? undefined,
    enabled: row.enabled === 1,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
