import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import {
  deleteExpiredSessionsForUser,
  deleteSessionById,
  findUserCredentialsByUsername,
  findUserProfileById,
  insertSession,
} from "../../database/queries/auth.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import { generateSessionToken, getSessionExpiryTs, verifyPassword } from "../../utils/auth.ts";
import { AuthResponse, LoginRequest, MeResponse } from "shared/api";
import { getBearerToken, requireRequestUser } from "./helpers.ts";
import { loginRateLimit } from "./rateLimits.ts";

const router = Router();

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const decoded = S.decodeUnknownEither(LoginRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { username, password } = decoded.right;
    const db = getDatabase();

    const user = await findUserCredentialsByUsername(db, username);

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const now = nowTs();
    const token = generateSessionToken();
    const expiresAt = getSessionExpiryTs();

    await insertSession(db, { id: token, userId: user.id, expiresAt, createdAt: now });

    await deleteExpiredSessionsForUser(db, { userId: user.id, now });

    logger.info({ username }, "User logged in");

    res.json(
      S.encodeSync(AuthResponse)({
        token,
        user: { id: user.id, username: user.username },
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error during login");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (token) {
      const db = getDatabase();
      await deleteSessionById(db, token);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error during logout");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const requestUser = requireRequestUser(req, res);
    if (!requestUser) {
      return;
    }

    const db = getDatabase();
    const user = await findUserProfileById(db, requestUser.id);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(
      S.encodeSync(MeResponse)({
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Error fetching user info");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
