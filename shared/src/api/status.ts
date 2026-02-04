import { Schema as S } from "effect";
import { ServiceStatus } from "../schemas/status.ts";

// GET /api/status - Real-time status
export const StatusResponse = S.Array(ServiceStatus);
export type StatusResponse = S.Schema.Type<typeof StatusResponse>;

// GET /api/status/cached - Cached status
export const CachedStatusResponse = S.Array(ServiceStatus);
export type CachedStatusResponse = S.Schema.Type<typeof CachedStatusResponse>;
