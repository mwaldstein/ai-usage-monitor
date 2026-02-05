import { Router } from "express";
import servicesRouter from "./services.ts";
import quotasRouter from "./quotas.ts";
import statusRouter from "./status.ts";
import usageRouter from "./usage.ts";
import logsRouter from "./logs.ts";
import authRouter from "./auth.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = Router();

// Auth routes are public (login, register, status check)
router.use("/auth", authRouter);

// All other routes require auth when AUTH_SECRET is set
router.use("/services", requireAuth, servicesRouter);
router.use("/quotas", requireAuth, quotasRouter);
router.use("/status", requireAuth, statusRouter);
router.use("/usage", requireAuth, usageRouter);
router.use("/logs", requireAuth, logsRouter);

export default router;
