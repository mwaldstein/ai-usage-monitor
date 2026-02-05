import { Router } from "express";
import crypto from "crypto";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import { findUserIdByUsername, insertSession, insertUser } from "../../database/queries/auth.ts";
import { hasAnyUsers } from "../../middleware/auth.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import {
  generateSessionToken,
  getSessionExpiryTs,
  generateSetupCode,
  hasActiveSetupCode,
  hashPassword,
  validateSetupCode,
} from "../../utils/auth.ts";
import { RegisterRequest, AuthResponse } from "shared/api";
import { registerRateLimit } from "./rateLimits.ts";

const router = Router();

router.post("/register", registerRateLimit, async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(RegisterRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { username, password, setupCode } = decoded.right;

    const usersExist = await hasAnyUsers();
    if (usersExist) {
      res.status(403).json({ error: "Registration is closed. Contact an administrator." });
      return;
    }

    if (!hasActiveSetupCode()) {
      const newCode = generateSetupCode();
      logger.info("==========================================================");
      logger.info("  SETUP CODE REGENERATED");
      logger.info(`  Enter this code in the web UI to register: ${newCode}`);
      logger.info("==========================================================");
      res.status(403).json({
        error: "Setup code expired. A new code has been printed to the server logs.",
      });
      return;
    }

    if (!validateSetupCode(setupCode)) {
      res
        .status(403)
        .json({ error: "Invalid setup code. Check the server logs for the correct code." });
      return;
    }

    const db = getDatabase();
    const existing = await findUserIdByUsername(db, username);
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = nowTs();

    await insertUser(db, { id, username, passwordHash, createdAt: now, updatedAt: now });

    const token = generateSessionToken();
    const expiresAt = getSessionExpiryTs();

    await insertSession(db, { id: token, userId: id, expiresAt, createdAt: now });

    logger.info({ username }, "First user registered successfully");

    res.status(201).json(
      S.encodeSync(AuthResponse)({
        token,
        user: { id, username },
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error during registration");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
