import { Schema as S } from "effect";
import { AIService } from "../schemas/service.ts";

// POST /api/services - Create service
export const CreateServiceRequest = S.Struct({
  name: S.String,
  provider: S.String,
  apiKey: S.optional(S.String),
  bearerToken: S.optional(S.String),
  baseUrl: S.optional(S.String),
  enabled: S.optional(S.Boolean),
});
export type CreateServiceRequest = S.Schema.Type<typeof CreateServiceRequest>;

export const CreateServiceResponse = AIService;
export type CreateServiceResponse = S.Schema.Type<typeof CreateServiceResponse>;

// PUT /api/services/:id - Update service
export const UpdateServiceRequest = S.partial(
  S.Struct({
    name: S.String,
    apiKey: S.String,
    bearerToken: S.String,
    baseUrl: S.String,
    enabled: S.Boolean,
    displayOrder: S.Number,
  }),
);
export type UpdateServiceRequest = S.Schema.Type<typeof UpdateServiceRequest>;

export const UpdateServiceResponse = AIService;
export type UpdateServiceResponse = S.Schema.Type<typeof UpdateServiceResponse>;

// GET /api/services - List services
export const ListServicesResponse = S.Array(AIService);
export type ListServicesResponse = S.Schema.Type<typeof ListServicesResponse>;

// POST /api/services/reorder
export const ReorderServicesRequest = S.Struct({
  serviceIds: S.Array(S.String), // Array of service IDs
});
export type ReorderServicesRequest = S.Schema.Type<typeof ReorderServicesRequest>;

export const ReorderServicesResponse = S.Array(AIService);
export type ReorderServicesResponse = S.Schema.Type<typeof ReorderServicesResponse>;
