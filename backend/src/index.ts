import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Schema as S } from "effect";

import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

import { VERSION, COMMIT_SHA } from "./version.ts";
import apiRoutes from "./routes/api.ts";
import { nowTs } from "./utils/dates.ts";
import { initTracing } from "./utils/tracing.ts";
import { initializeWebSocket, broadcast } from "./utils/ws.ts";
import { startServer, registerSignalHandlers } from "./utils/lifecycle.ts";
import { HealthResponse, VersionResponse } from "shared/api";

const tracingSdk = initTracing();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ quiet: true });

const app = express();
const server = createServer(app);
const wss = initializeWebSocket(server);

const PORT = process.env.PORT || 3001;

const REFRESH_INTERVAL_RAW = process.env.REFRESH_INTERVAL || "*/5 * * * *";
const REFRESH_INTERVAL = /^\d+$/.test(REFRESH_INTERVAL_RAW)
  ? `*/${REFRESH_INTERVAL_RAW} * * * *`
  : REFRESH_INTERVAL_RAW;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json(S.encodeSync(HealthResponse)({ status: "ok", ts: nowTs() }));
});

// Version endpoint
app.get("/version", (req, res) => {
  res.json(S.encodeSync(VersionResponse)({ version: VERSION, commitSha: COMMIT_SHA }));
});

// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  const frontendDistPath = path.join(__dirname, "../frontend-dist");
  app.use(express.static(frontendDistPath));

  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

const lifecycleOptions = {
  server,
  wss,
  tracingSdk,
  port: PORT,
  refreshInterval: REFRESH_INTERVAL,
  broadcast,
};

registerSignalHandlers(lifecycleOptions);
startServer(lifecycleOptions);
