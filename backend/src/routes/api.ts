import { Router } from "express";
import servicesRouter from "./services.ts";
import quotasRouter from "./quotas.ts";
import statusRouter from "./status.ts";
import usageRouter from "./usage.ts";
import logsRouter from "./logs.ts";

const router = Router();

router.use("/services", servicesRouter);
router.use("/quotas", quotasRouter);
router.use("/status", statusRouter);
router.use("/usage", usageRouter);
router.use("/logs", logsRouter);

export default router;
