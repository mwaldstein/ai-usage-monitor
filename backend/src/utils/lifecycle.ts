import type { Server } from "http";
import type { ScheduledTask } from "node-cron";
import type { WebSocketServer } from "ws";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import type { ServerMessage as ServerMessageType } from "shared/ws";

import cron from "node-cron";
import path from "path";
import fs from "fs";

import {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  runMaintenance,
} from "../database/index.ts";
import { countUsers } from "../database/queries/auth.ts";
import { refreshQuotas } from "../services/quotas.ts";
import { generateSetupCode } from "./auth.ts";
import { logger } from "./logger.ts";
import { shutdownTracing } from "./tracing.ts";
import { closeAllConnections } from "./ws.ts";

interface LifecycleOptions {
  server: Server;
  wss: WebSocketServer;
  tracingSdk: NodeSDK | undefined;
  port: string | number;
  refreshInterval: string;
  broadcast: (data: ServerMessageType) => void;
}

interface LifecycleState {
  scheduledTask: ScheduledTask | null;
  maintenanceTask: ScheduledTask | null;
}

const state: LifecycleState = {
  scheduledTask: null,
  maintenanceTask: null,
};

export async function startServer(options: LifecycleOptions): Promise<void> {
  const { server, port, refreshInterval, broadcast } = options;

  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    await initializeDatabase();
    logger.info("Database initialized");

    // Check if first-run setup is needed
    const db0 = getDatabase();
    if ((await countUsers(db0)) === 0) {
      const setupCode = generateSetupCode();
      logger.info("==========================================================");
      logger.info("  FIRST-RUN SETUP");
      logger.info("  No users exist. To register the first admin account,");
      logger.info(`  enter this setup code in the web UI: ${setupCode}`);
      logger.info("==========================================================");
    }

    state.scheduledTask = cron.schedule(refreshInterval, () =>
      refreshQuotas(broadcast, refreshInterval),
    );

    const db = getDatabase();
    state.maintenanceTask = cron.schedule("1 3 * * *", () => runMaintenance(db));

    logger.info("Starting initial quota refresh (async)...");
    refreshQuotas(broadcast, refreshInterval).catch((error) =>
      logger.error({ err: error }, "Initial refresh error"),
    );

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error({ port }, "Port is already in use. Waiting 3 seconds before retrying...");
        setTimeout(() => {
          logger.info("Retrying server startup...");
          server.listen(port);
        }, 3000);
      } else {
        logger.error({ err: error }, "Server error");
        process.exit(1);
      }
    });

    server.listen(port, () => {
      logger.info({ port }, "Server running");
      logger.info("WebSocket server ready");
      logger.info({ refreshInterval }, "Quota refresh interval configured");
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

export async function gracefulShutdown(signal: string, options: LifecycleOptions): Promise<void> {
  const { server, wss, tracingSdk } = options;

  logger.info({ signal }, "Received signal, shutting down gracefully");

  logger.info("Closing HTTP server...");
  server.close(() => {
    logger.info("HTTP server closed");
  });

  closeAllConnections(wss);

  if (state.scheduledTask || state.maintenanceTask) {
    logger.info("Stopping cron jobs...");
    state.scheduledTask?.stop();
    state.maintenanceTask?.stop();
  }

  await shutdownTracing(tracingSdk);
  await closeDatabase();

  setTimeout(() => {
    logger.info("Shutdown complete");
    process.exit(0);
  }, 3000);
}

export function registerSignalHandlers(options: LifecycleOptions): void {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM", options));
  process.on("SIGINT", () => gracefulShutdown("SIGINT", options));

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Uncaught exception");
    if (
      error.message &&
      (error.message.includes("ECONNRESET") ||
        error.message.includes("EADDRINUSE") ||
        error.message.includes("database"))
    ) {
      gracefulShutdown("UNCAUGHT_EXCEPTION", options);
    }
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled rejection");
  });
}
