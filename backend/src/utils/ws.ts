import { WebSocket, WebSocketServer } from "ws";
import type { Server, IncomingMessage } from "http";
import { Schema as S, Either } from "effect";
import type { AIService, ServiceStatus, UsageQuota } from "../types/index.ts";
import { getDatabase } from "../database/index.ts";
import { listEnabledServices } from "../database/queries/services.ts";
import { listLatestQuotasForEnabledServices } from "../database/queries/usage.ts";
import { nowTs } from "./dates.ts";
import { getJWTExpiration } from "./jwt.ts";
import { logger } from "./logger.ts";
import { mapQuotaRow } from "../routes/mappers.ts";
import { validateToken, hasAnyUsers } from "../middleware/auth.ts";
import { ClientMessage, ErrorMessage, ServerMessage, StatusMessage } from "shared/ws";
import type {
  ErrorMessage as ErrorMessageType,
  ServerMessage as ServerMessageType,
  StatusMessage as StatusMessageType,
} from "shared/ws";

// WebSocket connections
const clients = new Set<WebSocket>();

export function initializeWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  wss.on("connection", handleConnection);

  return wss;
}

function handleConnection(ws: WebSocket, req: IncomingMessage) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  // If a token is provided, authenticate it
  if (token) {
    validateToken(token)
      .then((user) => {
        if (!user) {
          logger.warn("WebSocket connection rejected: invalid token");
          ws.close(4401, "Invalid or expired token");
          return;
        }
        logger.info({ username: user.username }, "Authenticated WebSocket client connected");
        clients.add(ws);
        setupWebSocketHandlers(ws);
        sendStatusToClient(ws);
      })
      .catch((err: unknown) => {
        logger.error({ err }, "WebSocket auth error");
        ws.close(4500, "Authentication error");
      });
    return;
  }

  // No token — only allow if no users exist yet (setup mode)
  hasAnyUsers()
    .then((exists) => {
      if (exists) {
        logger.warn("WebSocket connection rejected: no token");
        ws.close(4401, "Authentication required");
        return;
      }
      logger.info("Client connected (setup mode, no users yet)");
      clients.add(ws);
      setupWebSocketHandlers(ws);
      sendStatusToClient(ws);
    })
    .catch((err: unknown) => {
      logger.error({ err }, "WebSocket auth check error");
      ws.close(4500, "Authentication error");
    });
}

function setupWebSocketHandlers(ws: WebSocket) {
  ws.on("message", (message) => {
    try {
      const data: unknown = JSON.parse(message.toString());
      const decoded = S.decodeUnknownEither(ClientMessage)(data);
      if (Either.isLeft(decoded)) {
        logger.warn({ err: decoded.left }, "Invalid WebSocket message");
        return;
      }

      const messageData = decoded.right;
      if (messageData.type === "subscribe") {
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
}

// Broadcast to all clients
export function broadcast(data: ServerMessageType) {
  const encoded = S.encodeSync(ServerMessage)(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(encoded));
    }
  });
}

// Send status to specific client
async function sendStatusToClient(ws: WebSocket) {
  try {
    const db = getDatabase();

    // Read-only initial payload: use cached quotas from the DB (no upstream fetch).
    const services: readonly AIService[] = await listEnabledServices(db);

    const quotaRows = await listLatestQuotasForEnabledServices(db);

    const quotasByService = new Map<string, UsageQuota[]>();
    for (const row of quotaRows) {
      const quota = mapQuotaRow(row);
      const list = quotasByService.get(quota.serviceId) || [];
      list.push(quota);
      quotasByService.set(quota.serviceId, list);
    }

    const statuses: ServiceStatus[] = services.map((service) => {
      const quotas = quotasByService.get(service.id) || [];
      const lastUpdated = quotas.reduce<number>(
        (max, q) => (q.updatedAt > max ? q.updatedAt : max),
        0,
      );

      // Extract JWT expiration from bearer token or API key
      let tokenExpiration: number | undefined;
      if (service.bearerToken) {
        tokenExpiration = getJWTExpiration(service.bearerToken) ?? undefined;
      }
      if (!tokenExpiration && service.apiKey) {
        tokenExpiration = getJWTExpiration(service.apiKey) ?? undefined;
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

    const message: StatusMessageType = {
      type: "status",
      data: statuses,
      ts: nowTs(),
    };
    ws.send(JSON.stringify(S.encodeSync(StatusMessage)(message)));
  } catch (error) {
    logger.error({ err: error }, "Error sending status to client");
    const message: ErrorMessageType = {
      type: "error",
      error: "Failed to fetch status",
    };
    ws.send(JSON.stringify(S.encodeSync(ErrorMessage)(message)));
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
