import { Router } from "express";
import historyRouter from "./history.ts";
import analyticsRouter from "./analytics/index.ts";

const router = Router();

router.use("/history", historyRouter);
router.use("/analytics", analyticsRouter);

export default router;
