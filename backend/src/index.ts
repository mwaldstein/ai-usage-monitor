import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { initializeDatabase, getDatabase, runMaintenance } from "./database/index.ts";
import { VERSION, COMMIT_SHA } from "./version.ts";
import apiRoutes from "./routes/api.ts";
import { ServiceFactory } from "./services/factory.ts";
import type { AIService, ServiceStatus } from "./types/index.ts";
import { nowTs } from "./utils/dates.ts";
import { logger } from "./utils/logger.ts";
import { initTracing, shutdownTracing } from "./utils/tracing.ts";

// Initialize OpenTelemetry tracing early (before any logging)
const tracingSdk = initTracing();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ quiet: true });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

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

// WebSocket connections
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  logger.info("Client connected");
  clients.add(ws);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "subscribe") {
        // Client subscribed to updates
        logger.info("Client subscribed to updates");
      }
    } catch (error) {
      logger.error({ err: error }, "Error parsing WebSocket message");
    }
  });

  ws.on("close", () => {
    logger.info("Client disconnected");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    logger.error({ err: error }, "WebSocket error");
    clients.delete(ws);
  });

  // Send initial data
  sendStatusToClient(ws);
});

// Broadcast to all clients
function broadcast(data: any) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Send status to specific client
async function sendStatusToClient(ws: WebSocket) {
  try {
    const db = getDatabase();

    // Read-only initial payload: use cached quotas from the DB (no upstream fetch).
    const serviceRows = await db.all("SELECT * FROM services WHERE enabled = 1");
    const services: AIService[] = serviceRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      apiKey: row.api_key,
      bearerToken: row.bearer_token,
      baseUrl: row.base_url,
      enabled: row.enabled === 1,
      displayOrder: row.display_order ?? 0,
      createdAt: row.created_at ?? 0,
      updatedAt: row.updated_at ?? 0,
    }));

    const quotaRows = await db.all(`
      SELECT * FROM (
        SELECT q.*,
               ROW_NUMBER() OVER (
                  PARTITION BY q.service_id, q.metric
                  -- Prefer insertion order over timestamps.
                  -- Some historical DB rows may have clock-skewed timestamps,
                  -- which makes cached views appear in the wrong timezone.
                  ORDER BY q.rowid DESC
                ) AS rn
        FROM quotas q
        JOIN services s ON s.id = q.service_id
        WHERE s.enabled = 1
      )
      WHERE rn = 1
    `);

    const quotasByService = new Map<string, any[]>();
    for (const row of quotaRows) {
      const list = quotasByService.get(row.service_id) || [];
      list.push({
        id: row.id,
        serviceId: row.service_id,
        metric: row.metric,
        limit: row.limit_value,
        used: row.used_value,
        remaining: row.remaining_value,
        resetAt: row.reset_at ?? 0,
        createdAt: row.created_at ?? 0,
        updatedAt: row.updated_at ?? 0,
        type: row.type,
        replenishmentRate: row.replenishment_amount
          ? { amount: row.replenishment_amount, period: row.replenishment_period }
          : undefined,
      });
      quotasByService.set(row.service_id, list);
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = quotasByService.get(service.id) || [];
      const lastUpdated = quotas.reduce<number>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        0,
      );

      return {
        service,
        quotas,
        lastUpdated: lastUpdated > 0 ? lastUpdated : service.updatedAt,
        isHealthy: quotas.length > 0,
        authError: false,
        error: quotas.length > 0 ? undefined : "No cached quota data yet",
      };
    });

    ws.send(
      JSON.stringify({
        type: "status",
        data: statuses,
        ts: nowTs(),
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Error sending status to client");
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Failed to fetch status",
      }),
    );
  }
}

// Parse refresh interval to get minutes (supports simple "every N minutes" format)
function getRefreshIntervalMinutes(): number {
  // Handle cron format like */5 * * * * (every 5 minutes)
  const match = REFRESH_INTERVAL.match(/^\*\/(\d+) \* \* \* \*$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Default to 5 minutes if parsing fails
  return 5;
}

let refreshInProgress = false;

// Refresh quotas periodically
async function refreshQuotas() {
  if (refreshInProgress) {
    logger.info("Refresh already in progress; skipping this run");
    return;
  }

  refreshInProgress = true;
  try {
    logger.info("Refreshing quotas...");
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");

    // Map database columns to TypeScript properties
    const services: AIService[] = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      apiKey: row.api_key,
      bearerToken: row.bearer_token,
      baseUrl: row.base_url,
      enabled: row.enabled === 1,
      displayOrder: row.display_order ?? 0,
      createdAt: row.created_at ?? 0,
      updatedAt: row.updated_at ?? 0,
    }));

    const results: ServiceStatus[] = [];
    const intervalMinutes = getRefreshIntervalMinutes();
    const staggerDelayMs =
      services.length > 1 ? (intervalMinutes * 60 * 1000) / services.length : 0;

    for (let i = 0; i < services.length; i++) {
      const service = services[i];

      // Stagger refreshes evenly across the refresh window
      if (i > 0 && staggerDelayMs > 0) {
        logger.info(
          { service: service.name, waitSeconds: Math.round(staggerDelayMs / 1000) },
          "Staggering service refresh",
        );
        await new Promise((resolve) => setTimeout(resolve, staggerDelayMs));
      }

      try {
        // Wrap in timeout to prevent one slow service from blocking others
        const status = await Promise.race([
          ServiceFactory.getServiceStatus(service),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Service refresh timeout")), 15000),
          ),
        ]);
        results.push(status);

        // Only update database if service returned quotas successfully
        if (status.quotas && status.quotas.length > 0) {
          try {
            // Update quotas in database
            const now = nowTs();
            for (const quota of status.quotas) {
              await db.run(
                `INSERT INTO quotas (id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                 limit_value = excluded.limit_value,
                 used_value = excluded.used_value,
                 remaining_value = excluded.remaining_value,
                 type = excluded.type,
                 replenishment_amount = excluded.replenishment_amount,
                 replenishment_period = excluded.replenishment_period,
                 reset_at = excluded.reset_at,
                 updated_at = ?`,
                [
                  quota.id,
                  quota.serviceId,
                  quota.metric,
                  quota.limit,
                  quota.used,
                  quota.remaining,
                  quota.type || null,
                  quota.replenishmentRate?.amount ?? null,
                  quota.replenishmentRate?.period ?? null,
                  quota.resetAt,
                  now,
                  now,
                  now,
                ],
              );
            }

            // Log usage history
            for (const quota of status.quotas) {
              await db.run(
                "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
                [quota.serviceId, quota.metric, now, quota.used],
              );
            }
          } catch (dbError) {
            logger.error(
              { err: dbError, service: service.name },
              "Database error while saving quotas",
            );
            // Don't let database errors break the entire refresh
          }
        }
      } catch (error) {
        logger.error({ err: error, service: service.name }, "Error refreshing quotas for service");
        results.push({
          service,
          quotas: [],
          lastUpdated: nowTs(),
          isHealthy: false,
          authError: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Broadcast to all clients
    broadcast({
      type: "status",
      data: results,
      ts: nowTs(),
    });

    logger.info("Quotas refreshed successfully");
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas");
  } finally {
    refreshInProgress = false;
  }
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
    scheduledTask = cron.schedule(REFRESH_INTERVAL, refreshQuotas);

    // Schedule daily database maintenance (WAL checkpoint + incremental vacuum) at 3:01 AM
    // Offset by 1 minute to avoid stacking with quota refresh (runs on :00, :05, etc.)
    const db = getDatabase();
    maintenanceTask = cron.schedule("1 3 * * *", () => runMaintenance(db));

    // Initial quota refresh (run async so server starts immediately)
    logger.info("Starting initial quota refresh (async)...");
    refreshQuotas().catch((error) => logger.error({ err: error }, "Initial refresh error"));

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
  logger.info("Closing WebSocket connections...");
  wss.clients.forEach((ws) => {
    ws.close();
  });
  wss.close(() => {
    logger.info("WebSocket server closed");
  });

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
