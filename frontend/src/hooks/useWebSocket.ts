import { useState, useCallback, useEffect } from "react";
import type { ServiceStatus } from "../types";
import { useWebSocketConnection } from "./wsConnection";
import { mergeStatuses, normalizeStatuses, type MergeMode } from "./statusNormalization";
import { getApiBaseUrl } from "../services/backendUrls";

const API_URL = getApiBaseUrl();

export function useWebSocket() {
  const { isConnected, isReconnecting, addMessageHandler } = useWebSocketConnection();
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    return addMessageHandler((data: unknown) => {
      const message = data as { type?: string; data?: ServiceStatus[]; ts?: number };

      if (message.type === "status" && message.data) {
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(message.data as ServiceStatus[]), "full"),
        );
        setLastUpdate(new Date((message.ts ?? Date.now() / 1000) * 1000));

        const authErrors = message.data.filter((status) => status.authError);
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
      }
    });
  }, [addMessageHandler]);

  const fetchAndMerge = useCallback((url: string, mode: MergeMode) => {
    fetch(url, mode === "partial" ? { method: "POST" } : undefined)
      .then((response) => response.json())
      .then((data) => {
        const statuses = Array.isArray(data) ? data : [data];
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(statuses as ServiceStatus[]), mode),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error fetching status:", error));
  }, []);

  const reloadCached = useCallback(() => {
    fetchAndMerge(`${API_URL}/status/cached`, "full");
  }, [fetchAndMerge]);

  const refresh = useCallback(() => {
    fetch(`${API_URL}/quotas/refresh`, { method: "POST" })
      .then((response) => response.json())
      .then((data) => {
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(data as ServiceStatus[]), "full"),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error refreshing quotas:", error));
  }, []);

  const refreshService = useCallback((serviceId: string) => {
    fetch(`${API_URL}/quotas/refresh/${serviceId}`, { method: "POST" })
      .then((response) => response.json())
      .then((data) => {
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses([data as ServiceStatus]), "partial"),
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
