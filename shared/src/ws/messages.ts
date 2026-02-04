import { Schema as S } from "effect";
import { ServiceStatus } from "../schemas/status.ts";

// Server → Client messages
export const StatusMessage = S.Struct({
  type: S.Literal("status"),
  data: S.Array(ServiceStatus),
  ts: S.Number,
});
export type StatusMessage = S.Schema.Type<typeof StatusMessage>;

export const ErrorMessage = S.Struct({
  type: S.Literal("error"),
  error: S.String,
});
export type ErrorMessage = S.Schema.Type<typeof ErrorMessage>;

// Discriminated union for all server messages
export const ServerMessage = S.Union(StatusMessage, ErrorMessage);
export type ServerMessage = S.Schema.Type<typeof ServerMessage>;

// Client → Server messages
export const SubscribeMessage = S.Struct({
  type: S.Literal("subscribe"),
});
export type SubscribeMessage = S.Schema.Type<typeof SubscribeMessage>;

// Extend with S.Union as more client message types are added
export const ClientMessage = SubscribeMessage;
export type ClientMessage = S.Schema.Type<typeof ClientMessage>;
