import { Router } from "express";
import crypto from "crypto";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { generateApiKey } from "../../utils/auth.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import {
  ApiKeyIdParams,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ListApiKeysResponse,
} from "shared/api";
import { requireRequestUser } from "./helpers.ts";

const router = Router();

router.get("/api-keys", requireAuth, async (req, res) => {
  try {
    const requestUser = requireRequestUser(req, res);
    if (!requestUser) {
      return;
    }

    const db = getDatabase();
    const rows = await db.all<{
      id: string;
      name: string;
      key_prefix: string;
      created_at: number;
      last_used_at: number | null;
    }>(
      "SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
      [requestUser.id],
    );

    const keys = rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));

    res.json(S.encodeSync(ListApiKeysResponse)(keys));
  } catch (err) {
    logger.error({ err }, "Error listing API keys");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api-keys", requireAuth, async (req, res) => {
  try {
    const requestUser = requireRequestUser(req, res);
    if (!requestUser) {
      return;
    }

    const decoded = S.decodeUnknownEither(CreateApiKeyRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { name } = decoded.right;
    const db = getDatabase();
    const id = crypto.randomUUID();
    const { key, keyHash, keyPrefix } = generateApiKey();
    const now = nowTs();

    await db.run(
      "INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, requestUser.id, name, keyHash, keyPrefix, now],
    );

    logger.info({ userId: requestUser.id, keyName: name }, "API key created");

    res.status(201).json(
      S.encodeSync(CreateApiKeyResponse)({
        id,
        name,
        key,
        keyPrefix,
        createdAt: now,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error creating API key");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/api-keys/:id", requireAuth, async (req, res) => {
  try {
    const requestUser = requireRequestUser(req, res);
    if (!requestUser) {
      return;
    }

    const paramsDecoded = S.decodeUnknownEither(ApiKeyIdParams)(req.params);
    if (Either.isLeft(paramsDecoded)) {
      res.status(400).json({ error: "Invalid API key id", details: paramsDecoded.left.message });
      return;
    }

    const { id } = paramsDecoded.right;
    if (!id.trim()) {
      res.status(400).json({ error: "Invalid API key id" });
      return;
    }

    const db = getDatabase();
    const existing = await db.get<{ id: string }>(
      "SELECT id FROM api_keys WHERE id = ? AND user_id = ?",
      [id, requestUser.id],
    );
    if (!existing) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    await db.run("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [id, requestUser.id]);

    logger.info({ userId: requestUser.id, keyId: id }, "API key deleted");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting API key");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
