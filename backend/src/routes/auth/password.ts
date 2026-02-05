import { Router } from "express";
import { Schema as S, Either } from "effect";
import { getDatabase } from "../../database/index.ts";
import {
  deleteOtherSessionsForUser,
  findUserPasswordHashById,
  updateUserPasswordHash,
} from "../../database/queries/auth.ts";
import { requireAuth } from "../../middleware/auth.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import { hashPassword, isApiKey, verifyPassword } from "../../utils/auth.ts";
import { ChangePasswordRequest } from "shared/api";
import { getBearerToken, requireRequestUser } from "./helpers.ts";

const router = Router();

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const requestUser = requireRequestUser(req, res);
    if (!requestUser) {
      return;
    }

    const token = getBearerToken(req);
    if (!token || isApiKey(token)) {
      res.status(403).json({ error: "Password changes require a logged-in session" });
      return;
    }

    const decoded = S.decodeUnknownEither(ChangePasswordRequest)(req.body);
    if (Either.isLeft(decoded)) {
      res.status(400).json({ error: "Invalid request", details: decoded.left.message });
      return;
    }

    const { currentPassword, newPassword } = decoded.right;
    const db = getDatabase();

    const passwordHash = await findUserPasswordHashById(db, requestUser.id);

    if (!passwordHash) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const valid = await verifyPassword(currentPassword, passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const now = nowTs();
    const nextPasswordHash = await hashPassword(newPassword);

    await updateUserPasswordHash(db, {
      userId: requestUser.id,
      passwordHash: nextPasswordHash,
      updatedAt: now,
    });

    await deleteOtherSessionsForUser(db, { userId: requestUser.id, keepSessionId: token });

    logger.info({ userId: requestUser.id }, "User changed password");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error changing password");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
