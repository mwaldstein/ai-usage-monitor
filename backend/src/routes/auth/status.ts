import { Router } from "express";
import { Schema as S } from "effect";
import { hasAnyUsers } from "../../middleware/auth.ts";
import { logger } from "../../utils/logger.ts";
import { AuthStatusResponse } from "shared/api";

const router = Router();

router.get("/status", async (_req, res) => {
  try {
    const usersExist = await hasAnyUsers();
    res.json(S.encodeSync(AuthStatusResponse)({ enabled: true, hasUsers: usersExist }));
  } catch (err) {
    logger.error({ err }, "Error checking auth status");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
