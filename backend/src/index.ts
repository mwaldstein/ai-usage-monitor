import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { createServer } from "http";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { initializeDatabase, getDatabase, runMaintenance } from "./database/index.ts";
import { VERSION, COMMIT_SHA } from "./version.ts";
import apiRoutes from "./routes/api.ts";
import { refreshQuotas } from "./services/quotas.ts";
import { nowTs } from "./utils/dates.ts";
import { logger } from "./utils/logger.ts";
import { initTracing, shutdownTracing } from "./utils/tracing.ts";
import { initializeWebSocket, broadcast, closeAllConnections } from "./utils/ws.ts";

// Initialize OpenTelemetry tracing early (before any logging)
const tracingSdk = initTracing();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ quiet: true });

const app = express();
const server = createServer(app);
const wss = initializeWebSocket(server);

const PORT = process.env.PORT || 3001;

// Supports:
// - Cron form: "*/5 * * * *"
// - Simple minutes form: "5" (treated as every 5 minutes)
const REFRESH_INTERVAL_RAW = process.env.REFRESH_INTERVAL || "*/5 * * * *";
const REFRESH_INTERVAL = /^\d+$/.test(REFRESH_INTERVAL_RAW)
  ? `*/${REFRESH_INTERVAL_RAW} * * * *`
  : REFRESH_INTERVAL_RAW;

// Store scheduled tasks for cleanup
let scheduledTask: cron.ScheduledTask | null = null;
let maintenanceTask: cron.ScheduledTask | null = null;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: nowTs() });
});

// Version endpoint - uses compile-time injected values
app.get("/version", (req, res) => {
  res.json({ version: VERSION, commitSha: COMMIT_SHA });
});

// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  const frontendDistPath = path.join(__dirname, "../frontend-dist");
  app.use(express.static(frontendDistPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

// Initialize and start server
async function startServer() {
  try {
    // Create data directory
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    await initializeDatabase();
    logger.info("Database initialized");

    // Schedule periodic refresh
    scheduledTask = cron.schedule(REFRESH_INTERVAL, () =>
      refreshQuotas(broadcast, REFRESH_INTERVAL),
    );

    // Schedule daily database maintenance (WAL checkpoint + incremental vacuum) at 3:01 AM
    // Offset by 1 minute to avoid stacking with quota refresh (runs on :00, :05, etc.)
    const db = getDatabase();
    maintenanceTask = cron.schedule("1 3 * * *", () => runMaintenance(db));

    // Initial quota refresh (run async so server starts immediately)
    logger.info("Starting initial quota refresh (async)...");
    refreshQuotas(broadcast, REFRESH_INTERVAL).catch((error) =>
      logger.error({ err: error }, "Initial refresh error"),
    );

    // Handle server startup errors (e.g., port in use) - MUST be attached BEFORE listen()
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error(
          { port: PORT },
          "Port is already in use. Waiting 3 seconds before retrying...",
        );
        setTimeout(() => {
          logger.info("Retrying server startup...");
          server.listen(PORT);
        }, 3000);
      } else {
        logger.error({ err: error }, "Server error");
        process.exit(1);
      }
    });

    // Start server
    server.listen(PORT, () => {
      logger.info({ port: PORT }, "Server running");
      logger.info("WebSocket server ready");
      logger.info({ refreshInterval: REFRESH_INTERVAL }, "Quota refresh interval configured");
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

startServer();

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received signal, shutting down gracefully");

  // Stop accepting new connections
  logger.info("Closing HTTP server...");
  server.close(() => {
    logger.info("HTTP server closed");
  });

  // Close all WebSocket connections
  closeAllConnections(wss);

  // Stop cron jobs
  if (scheduledTask || maintenanceTask) {
    logger.info("Stopping cron jobs...");
    scheduledTask?.stop();
    maintenanceTask?.stop();
  }

  // Shutdown OpenTelemetry tracing
  await shutdownTracing(tracingSdk);

  // Give connections time to close, then exit
  setTimeout(() => {
    logger.info("Shutdown complete");
    process.exit(0);
  }, 3000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors - don't shut down on non-fatal errors during quota refresh
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception");
  // Only shut down for truly fatal errors, not service fetch errors
  if (
    error.message &&
    (error.message.includes("ECONNRESET") ||
      error.message.includes("EADDRINUSE") ||
      error.message.includes("database"))
  ) {
    gracefulShutdown("UNCAUGHT_EXCEPTION");
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled rejection");
  // Log but don't shut down - let the individual service error handlers deal with it
  // This prevents one misconfigured service from killing the entire server
});
