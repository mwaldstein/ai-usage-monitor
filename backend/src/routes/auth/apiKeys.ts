import { Router } from "express";
import crypto from "crypto";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import {
  deleteApiKeyByUser,
  hasApiKeyForUser,
  insertApiKey,
  listApiKeysByUser,
} from "../../database/queries/auth.ts";
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
    const keys = await listApiKeysByUser(db, requestUser.id);

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

    await insertApiKey(db, {
      id,
      userId: requestUser.id,
      name,
      keyHash,
      keyPrefix,
      createdAt: now,
    });

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
    const exists = await hasApiKeyForUser(db, { userId: requestUser.id, apiKeyId: id });
    if (!exists) {
      res.status(404).json({ error: "API key not found" });
      return;
    }

    await deleteApiKeyByUser(db, { userId: requestUser.id, apiKeyId: id });

    logger.info({ userId: requestUser.id, keyId: id }, "API key deleted");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error deleting API key");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
