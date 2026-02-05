import * as SqlSchema from "@effect/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { DatabaseClient } from "../client.ts";
import { runDbQueryEffect } from "./runtime.ts";
import {
  ApiKeyByUserRequestSchema,
  ApiKeyHashRequestSchema,
  ApiKeyInsertRequestSchema,
  ApiKeySummaryRowSchema,
  ApiKeyTouchRequestSchema,
  ApiKeyUserRowSchema,
  EmptyAuthQuerySchema,
  SessionDeleteOtherRequestSchema,
  SessionIdRequestSchema,
  SessionInsertRequestSchema,
  SessionLookupRequestSchema,
  SessionPurgeRequestSchema,
  SessionUserRowSchema,
  UserCountRowSchema,
  UserCredentialsRowSchema,
  UserIdRequestSchema,
  UserIdRowSchema,
  UserInsertRequestSchema,
  UserPasswordRowSchema,
  UserPasswordUpdateRequestSchema,
  UserProfileRowSchema,
  UsernameRequestSchema,
} from "../models/auth.ts";

export async function countUsers(db: DatabaseClient): Promise<number> {
  const query = SqlSchema.single({
    Request: EmptyAuthQuerySchema,
    Result: UserCountRowSchema,
    execute: () => Effect.tryPromise(() => db.all("SELECT COUNT(*) AS count FROM users")),
  });

  const row = await runDbQueryEffect(query({}));
  return row.count;
}

export async function findUserIdByUsername(
  db: DatabaseClient,
  username: string,
): Promise<string | undefined> {
  const query = SqlSchema.findOne({
    Request: UsernameRequestSchema,
    Result: UserIdRowSchema,
    execute: ({ username }) =>
      Effect.tryPromise(() => db.all("SELECT id FROM users WHERE username = ?", [username])),
  });

  const row = await runDbQueryEffect(query({ username }));
  return Option.match(row, { onNone: () => undefined, onSome: (value) => value.id });
}

export async function findUserCredentialsByUsername(
  db: DatabaseClient,
  username: string,
): Promise<{ id: string; username: string; passwordHash: string } | undefined> {
  const query = SqlSchema.findOne({
    Request: UsernameRequestSchema,
    Result: UserCredentialsRowSchema,
    execute: ({ username }) =>
      Effect.tryPromise(() =>
        db.all("SELECT id, username, password_hash FROM users WHERE username = ?", [username]),
      ),
  });

  const row = await runDbQueryEffect(query({ username }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: (value) => ({
      id: value.id,
      username: value.username,
      passwordHash: value.password_hash,
    }),
  });
}

export async function findUserProfileById(
  db: DatabaseClient,
  userId: string,
): Promise<{ id: string; username: string; createdAt: number } | undefined> {
  const query = SqlSchema.findOne({
    Request: UserIdRequestSchema,
    Result: UserProfileRowSchema,
    execute: ({ userId }) =>
      Effect.tryPromise(() =>
        db.all("SELECT id, username, created_at FROM users WHERE id = ?", [userId]),
      ),
  });

  const row = await runDbQueryEffect(query({ userId }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: (value) => ({ id: value.id, username: value.username, createdAt: value.created_at }),
  });
}

export async function findUserPasswordHashById(
  db: DatabaseClient,
  userId: string,
): Promise<string | undefined> {
  const query = SqlSchema.findOne({
    Request: UserIdRequestSchema,
    Result: UserPasswordRowSchema,
    execute: ({ userId }) =>
      Effect.tryPromise(() => db.all("SELECT password_hash FROM users WHERE id = ?", [userId])),
  });

  const row = await runDbQueryEffect(query({ userId }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: (value) => value.password_hash,
  });
}

export async function insertUser(
  db: DatabaseClient,
  request: {
    id: string;
    username: string;
    passwordHash: string;
    createdAt: number;
    updatedAt: number;
  },
): Promise<void> {
  const command = SqlSchema.void({
    Request: UserInsertRequestSchema,
    execute: ({ id, username, passwordHash, createdAt, updatedAt }) =>
      Effect.tryPromise(() =>
        db.run(
          "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [id, username, passwordHash, createdAt, updatedAt],
        ),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function updateUserPasswordHash(
  db: DatabaseClient,
  request: { userId: string; passwordHash: string; updatedAt: number },
): Promise<void> {
  const command = SqlSchema.void({
    Request: UserPasswordUpdateRequestSchema,
    execute: ({ userId, passwordHash, updatedAt }) =>
      Effect.tryPromise(() =>
        db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
          passwordHash,
          updatedAt,
          userId,
        ]),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function insertSession(
  db: DatabaseClient,
  request: { id: string; userId: string; expiresAt: number; createdAt: number },
): Promise<void> {
  const command = SqlSchema.void({
    Request: SessionInsertRequestSchema,
    execute: ({ id, userId, expiresAt, createdAt }) =>
      Effect.tryPromise(() =>
        db.run("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
          id,
          userId,
          expiresAt,
          createdAt,
        ]),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function deleteSessionById(db: DatabaseClient, sessionId: string): Promise<void> {
  const command = SqlSchema.void({
    Request: SessionIdRequestSchema,
    execute: ({ sessionId }) =>
      Effect.tryPromise(() => db.run("DELETE FROM sessions WHERE id = ?", [sessionId])),
  });

  await runDbQueryEffect(command({ sessionId }));
}

export async function deleteExpiredSessionsForUser(
  db: DatabaseClient,
  request: { userId: string; now: number },
): Promise<void> {
  const command = SqlSchema.void({
    Request: SessionPurgeRequestSchema,
    execute: ({ userId, now }) =>
      Effect.tryPromise(() =>
        db.run("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?", [userId, now]),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function deleteOtherSessionsForUser(
  db: DatabaseClient,
  request: { userId: string; keepSessionId: string },
): Promise<void> {
  const command = SqlSchema.void({
    Request: SessionDeleteOtherRequestSchema,
    execute: ({ userId, keepSessionId }) =>
      Effect.tryPromise(() =>
        db.run("DELETE FROM sessions WHERE user_id = ? AND id != ?", [userId, keepSessionId]),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function findSessionUser(
  db: DatabaseClient,
  request: { sessionId: string; now: number },
): Promise<{ userId: string; username: string } | undefined> {
  const query = SqlSchema.findOne({
    Request: SessionLookupRequestSchema,
    Result: SessionUserRowSchema,
    execute: ({ sessionId, now }) =>
      Effect.tryPromise(() =>
        db.all(
          `SELECT s.user_id, u.username
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.expires_at > ?`,
          [sessionId, now],
        ),
      ),
  });

  const row = await runDbQueryEffect(query(request));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: (value) => ({ userId: value.user_id, username: value.username }),
  });
}

export async function findApiKeyUser(
  db: DatabaseClient,
  keyHash: string,
): Promise<{ apiKeyId: string; userId: string; username: string } | undefined> {
  const query = SqlSchema.findOne({
    Request: ApiKeyHashRequestSchema,
    Result: ApiKeyUserRowSchema,
    execute: ({ keyHash }) =>
      Effect.tryPromise(() =>
        db.all(
          `SELECT ak.id AS key_id, ak.user_id, u.username
           FROM api_keys ak
           JOIN users u ON u.id = ak.user_id
           WHERE ak.key_hash = ?`,
          [keyHash],
        ),
      ),
  });

  const row = await runDbQueryEffect(query({ keyHash }));
  return Option.match(row, {
    onNone: () => undefined,
    onSome: (value) => ({
      apiKeyId: value.key_id,
      userId: value.user_id,
      username: value.username,
    }),
  });
}

export async function listApiKeysByUser(
  db: DatabaseClient,
  userId: string,
): Promise<
  readonly {
    id: string;
    name: string;
    keyPrefix: string;
    createdAt: number;
    lastUsedAt: number | null;
  }[]
> {
  const query = SqlSchema.findAll({
    Request: UserIdRequestSchema,
    Result: ApiKeySummaryRowSchema,
    execute: ({ userId }) =>
      Effect.tryPromise(() =>
        db.all(
          "SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
          [userId],
        ),
      ),
  });

  const rows = await runDbQueryEffect(query({ userId }));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function insertApiKey(
  db: DatabaseClient,
  request: {
    id: string;
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    createdAt: number;
  },
): Promise<void> {
  const command = SqlSchema.void({
    Request: ApiKeyInsertRequestSchema,
    execute: ({ id, userId, name, keyHash, keyPrefix, createdAt }) =>
      Effect.tryPromise(() =>
        db.run(
          "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, userId, name, keyHash, keyPrefix, createdAt],
        ),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function hasApiKeyForUser(
  db: DatabaseClient,
  request: { userId: string; apiKeyId: string },
): Promise<boolean> {
  const query = SqlSchema.findOne({
    Request: ApiKeyByUserRequestSchema,
    Result: UserIdRowSchema,
    execute: ({ userId, apiKeyId }) =>
      Effect.tryPromise(() =>
        db.all("SELECT id FROM api_keys WHERE id = ? AND user_id = ?", [apiKeyId, userId]),
      ),
  });

  const row = await runDbQueryEffect(query(request));
  return Option.isSome(row);
}

export async function deleteApiKeyByUser(
  db: DatabaseClient,
  request: { userId: string; apiKeyId: string },
): Promise<void> {
  const command = SqlSchema.void({
    Request: ApiKeyByUserRequestSchema,
    execute: ({ userId, apiKeyId }) =>
      Effect.tryPromise(() =>
        db.run("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [apiKeyId, userId]),
      ),
  });

  await runDbQueryEffect(command(request));
}

export async function touchApiKeyLastUsed(
  db: DatabaseClient,
  request: { apiKeyId: string; lastUsedAt: number },
): Promise<void> {
  const command = SqlSchema.void({
    Request: ApiKeyTouchRequestSchema,
    execute: ({ apiKeyId, lastUsedAt }) =>
      Effect.tryPromise(() =>
        db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [lastUsedAt, apiKeyId]),
      ),
  });

  await runDbQueryEffect(command(request));
}
