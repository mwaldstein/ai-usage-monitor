import { useState, useCallback, useEffect } from "react";
import { Schema as S, Either } from "effect";
import type { ServiceStatus } from "../types";
import { useWebSocketConnection } from "./wsConnection";
import { mergeStatuses, normalizeStatuses, type MergeMode } from "./statusNormalization";
import { getApiBaseUrl } from "../services/backendUrls";
import { authFetch } from "../services/authFetch";
import { RefreshQuotasResponse, StatusResponse } from "shared/api";
import { ServiceStatus as ServiceStatusSchema } from "shared/schemas";
import type { ServerMessage as ServerMessageType } from "shared/ws";

const API_URL = getApiBaseUrl();

export function useWebSocket() {
  const { isConnected, isReconnecting, addMessageHandler } = useWebSocketConnection();
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    return addMessageHandler((message: ServerMessageType) => {
      if (message.type === "status") {
        const nextStatuses = Array.from(message.data, (status) => ({ ...status }));
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(nextStatuses), "full"),
        );
        setLastUpdate(new Date((message.ts ?? Date.now() / 1000) * 1000));

        const authErrors = nextStatuses.filter((status) => status.authError);
        if (authErrors.length > 0) {
          console.error(
            "Authentication errors detected:",
            authErrors.map((s) => s.service.name),
          );

          const serviceNames = authErrors.map((s) => s.service.name).join(", ");
          alert(
            `⚠️ Authentication Failed: ${serviceNames}\n\nYour tokens may have expired or been revoked.\n\nPlease visit your AI provider and generate new tokens.\n\nAfter updating tokens, the dashboard will refresh automatically.`,
          );
        }
      } else if (message.type === "error") {
        console.error("WebSocket error:", message.error);
      }
    });
  }, [addMessageHandler]);

  const fetchAndMerge = useCallback((url: string, mode: MergeMode) => {
    authFetch(url, mode === "partial" ? { method: "POST" } : undefined)
      .then((response) => response.json())
      .then((data: unknown) => {
        const decoded = S.decodeUnknownEither(StatusResponse)(data);
        if (Either.isLeft(decoded)) {
          console.error("Invalid status response:", decoded.left);
          return;
        }
        const nextStatuses = Array.from(decoded.right, (status) => ({ ...status }));
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(nextStatuses), mode),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error fetching status:", error));
  }, []);

  const reloadCached = useCallback(() => {
    fetchAndMerge(`${API_URL}/status/cached`, "full");
  }, [fetchAndMerge]);

  const refresh = useCallback(() => {
    authFetch(`${API_URL}/quotas/refresh`, { method: "POST" })
      .then((response) => response.json())
      .then((data: unknown) => {
        const decoded = S.decodeUnknownEither(RefreshQuotasResponse)(data);
        if (Either.isLeft(decoded)) {
          console.error("Invalid refresh response:", decoded.left);
          return;
        }
        const nextStatuses = Array.from(decoded.right, (status) => ({ ...status }));
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(nextStatuses), "full"),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error refreshing quotas:", error));
  }, []);

  const refreshService = useCallback((serviceId: string) => {
    authFetch(`${API_URL}/quotas/refresh/${serviceId}`, { method: "POST" })
      .then((response) => response.json())
      .then((data: unknown) => {
        const decoded = S.decodeUnknownEither(ServiceStatusSchema)(data);
        if (Either.isLeft(decoded)) {
          console.error("Invalid refresh service response:", decoded.left);
          return;
        }
        const nextStatuses = [{ ...decoded.right }];
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(nextStatuses), "partial"),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error refreshing service:", error));
  }, []);

  return {
    statuses,
    isConnected,
    isReconnecting,
    lastUpdate,
    reloadCached,
    refresh,
    refreshService,
  };
}
