import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { AIService, ServiceStatus } from "../types/index.ts";
import { getDatabase } from "../database/index.ts";
import { nowTs } from "./dates.ts";
import { getJWTExpiration } from "./jwt.ts";
import { logger } from "./logger.ts";

// WebSocket connections
const clients = new Set<WebSocket>();

export function initializeWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on("connection", handleConnection);

  return wss;
}

function handleConnection(ws: WebSocket) {
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
}

// Broadcast to all clients
export function broadcast(data: unknown) {
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
    const services: AIService[] = serviceRows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      provider: row.provider as string,
      apiKey: row.api_key as string | undefined,
      bearerToken: row.bearer_token as string | undefined,
      baseUrl: row.base_url as string | undefined,
      enabled: row.enabled === 1,
      displayOrder: (row.display_order as number) ?? 0,
      createdAt: (row.created_at as number) ?? 0,
      updatedAt: (row.updated_at as number) ?? 0,
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

    const quotasByService = new Map<string, unknown[]>();
    for (const row of quotaRows) {
      const list = quotasByService.get(row.service_id as string) || [];
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
      quotasByService.set(row.service_id as string, list);
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = (quotasByService.get(service.id) || []) as ServiceStatus["quotas"];
      const lastUpdated = quotas.reduce<number>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        0,
      );

      // Extract JWT expiration from bearer token or API key
      let tokenExpiration: number | undefined;
      if (service.bearerToken) {
        tokenExpiration = getJWTExpiration(service.bearerToken);
      }
      if (!tokenExpiration && service.apiKey) {
        tokenExpiration = getJWTExpiration(service.apiKey);
      }

      return {
        service,
        quotas,
        lastUpdated: lastUpdated > 0 ? lastUpdated : service.updatedAt,
        isHealthy: quotas.length > 0,
        authError: false,
        error: quotas.length > 0 ? undefined : "No cached quota data yet",
        tokenExpiration,
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

export function closeAllConnections(wss: WebSocketServer) {
  logger.info("Closing WebSocket connections...");
  wss.clients.forEach((ws) => {
    ws.close();
  });
  wss.close(() => {
    logger.info("WebSocket server closed");
  });
}
