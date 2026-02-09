import * as SqlSchema from "@effect/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AIService } from "../../types/index.ts";
import type { DatabaseClient } from "../client.ts";
import { runDbQueryEffect } from "./runtime.ts";
import {
  EmptyQuerySchema,
  EnabledServiceByIdRequestSchema,
  mapServiceRowToDomain,
  ServiceByIdRequestSchema,
  ServiceCountRowSchema,
  ServiceInsertRequestSchema,
  ServiceRowSchema,
  ServiceUpdateCommandRequestSchema,
} from "../models/service.ts";

export interface InsertServiceRequest {
  readonly id: string;
  readonly name: string;
  readonly provider: AIService["provider"];
  readonly apiKey: string | null;
  readonly bearerToken: string | null;
  readonly baseUrl: string | null;
  readonly enabled: number;
  readonly displayOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export async function listEnabledServices(db: DatabaseClient): Promise<readonly AIService[]> {
  const query = SqlSchema.findAll({
    Request: EmptyQuerySchema,
    Result: ServiceRowSchema,
    execute: () =>
      Effect.tryPromise(() =>
        db.all(
          "SELECT * FROM services WHERE enabled = 1 ORDER BY display_order ASC, created_at ASC",
        ),
      ),
  });

  const rows = await runDbQueryEffect(query({}));
  return rows.map(mapServiceRowToDomain);
}

export async function countServices(db: DatabaseClient): Promise<number> {
  const query = SqlSchema.single({
    Request: EmptyQuerySchema,
    Result: ServiceCountRowSchema,
    execute: () => Effect.tryPromise(() => db.all("SELECT COUNT(*) as count FROM services")),
  });

  const row = await runDbQueryEffect(query({}));
  return row.count;
}

export async function findServiceById(
  db: DatabaseClient,
  id: string,
): Promise<AIService | undefined> {
  const query = SqlSchema.findOne({
    Request: ServiceByIdRequestSchema,
    Result: ServiceRowSchema,
    execute: ({ id }) =>
      Effect.tryPromise(() => db.all("SELECT * FROM services WHERE id = ?", [id])),
  });

  const row = await runDbQueryEffect(query({ id }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: mapServiceRowToDomain,
  });
}

export async function findEnabledServiceById(
  db: DatabaseClient,
  id: string,
): Promise<AIService | undefined> {
  const query = SqlSchema.findOne({
    Request: EnabledServiceByIdRequestSchema,
    Result: ServiceRowSchema,
    execute: ({ id, enabled }) =>
      Effect.tryPromise(() =>
        db.all("SELECT * FROM services WHERE id = ? AND enabled = ?", [id, enabled]),
      ),
  });

  const row = await runDbQueryEffect(query({ id, enabled: 1 }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: mapServiceRowToDomain,
  });
}

export async function insertService(
  db: DatabaseClient,
  request: InsertServiceRequest,
): Promise<void> {
  const command = SqlSchema.void({
    Request: ServiceInsertRequestSchema,
    execute: ({
      id,
      name,
      provider,
      apiKey,
      bearerToken,
      baseUrl,
      enabled,
      displayOrder,
      createdAt,
      updatedAt,
    }) =>
      Effect.tryPromise(() =>
        db.run(
          "INSERT INTO services (id, name, provider, api_key, bearer_token, base_url, enabled, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            id,
            name,
            provider,
            apiKey,
            bearerToken,
            baseUrl,
            enabled,
            displayOrder,
            createdAt,
            updatedAt,
          ],
        ),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function deleteServiceById(db: DatabaseClient, id: string): Promise<void> {
  const command = SqlSchema.void({
    Request: ServiceByIdRequestSchema,
    execute: ({ id }) => Effect.tryPromise(() => db.run("DELETE FROM services WHERE id = ?", [id])),
  });

  await runDbQueryEffect(command({ id }));
}

export async function updateServiceHealth(
  db: DatabaseClient,
  serviceId: string,
  error: string | null,
  errorKind: string | null,
): Promise<void> {
  await db.run("UPDATE services SET last_error = ?, last_error_kind = ? WHERE id = ?", [
    error,
    errorKind,
    serviceId,
  ]);
}

export async function runServiceUpdate(
  db: DatabaseClient,
  request: { statement: string; params: Array<string | number | null> },
): Promise<void> {
  const command = SqlSchema.void({
    Request: ServiceUpdateCommandRequestSchema,
    execute: ({ statement, params }) => Effect.tryPromise(() => db.run(statement, params)),
  });

  await runDbQueryEffect(command(request));
}
