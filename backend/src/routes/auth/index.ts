import { Router } from "express";
import statusRouter from "./status.ts";
import registerRouter from "./register.ts";
import sessionsRouter from "./sessions.ts";
import passwordRouter from "./password.ts";
import apiKeysRouter from "./apiKeys.ts";

const router = Router();

router.use(statusRouter);
router.use(registerRouter);
router.use(sessionsRouter);
router.use(passwordRouter);
router.use(apiKeysRouter);

export default router;
