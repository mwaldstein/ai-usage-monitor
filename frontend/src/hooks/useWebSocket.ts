import { useEffect, useRef, useState, useCallback } from "react";
import type { ServiceStatus } from "../types";
import { getMetricAnnotation } from "../types/metricDefinitions";

import { getApiBaseUrl, getWebSocketUrl } from "../services/backendUrls";

const WS_URL = getWebSocketUrl();
const API_URL = getApiBaseUrl();

type MergeMode = "full" | "partial";

// Merge helper function to preserve quota data
function mergeStatuses(
  prevStatuses: ServiceStatus[],
  newStatuses: ServiceStatus[],
  mode: MergeMode = "full",
): ServiceStatus[] {
  const mergedStatuses = [...prevStatuses];

  newStatuses.forEach((newStatus: ServiceStatus) => {
    const existingIndex = mergedStatuses.findIndex((s) => s.service.id === newStatus.service.id);

    if (existingIndex >= 0) {
      // Only update if the new status has quotas or if the service state changed
      // This prevents clearing numbers when a service is temporarily empty during refresh
      const existing = mergedStatuses[existingIndex];
      const shouldUpdate =
        newStatus.quotas.length > 0 || !existing.isHealthy || newStatus.error !== existing.error;

      if (shouldUpdate) {
        mergedStatuses[existingIndex] = newStatus;
      }
    } else {
      // New service, add it
      mergedStatuses.push(newStatus);
    }
  });

  if (mode === "full") {
    // Remove services that no longer exist
    const newServiceIds = new Set(newStatuses.map((s: ServiceStatus) => s.service.id));
    const filtered = mergedStatuses.filter((s) => newServiceIds.has(s.service.id));
    // Sort by displayOrder to maintain user-defined order
    return filtered.sort((a, b) => a.service.displayOrder - b.service.displayOrder);
  }

  // Partial updates shouldn't prune other services.
  // Still sort to maintain order
  return mergedStatuses.sort((a, b) => a.service.displayOrder - b.service.displayOrder);
}

/**
 * Get metric priority for sorting.
 * Priority is determined by:
 * 1. Backend-provided metadata (if available)
 * 2. Frontend local metric definitions
 * 3. Default value of 1000
 */
function getMetricOrder(
  provider: string,
  metric: string,
  metadata?: { priority?: number },
): number {
  // First check if backend provided a priority in metadata
  if (metadata?.priority !== undefined) {
    return metadata.priority;
  }

  // Fall back to local definitions
  const localDef = getMetricAnnotation(provider, metric);
  if (localDef?.priority !== undefined) {
    return localDef.priority;
  }

  // Handle dynamic patterns
  if (metric.endsWith("_quota")) return 10;

  // Default: last
  return 1000;
}

function normalizeStatus(status: ServiceStatus): ServiceStatus {
  // Filter legacy/derived metrics that were previously stored as standalone quotas.
  // We now represent these via `replenishmentRate` + `resetAt` on the main quota.
  const hiddenMetrics = new Set(["hourly_replenishment", "window_hours"]);
  const provider = status.service.provider;

  const quotas = [...(status.quotas || [])]
    .filter((q) => !hiddenMetrics.has(q.metric))
    .sort((a, b) => {
      const ao = getMetricOrder(provider, a.metric, a.metricMetadata);
      const bo = getMetricOrder(provider, b.metric, b.metricMetadata);
      if (ao !== bo) return ao - bo;
      return a.metric.localeCompare(b.metric);
    });

  return { ...status, quotas };
}

function normalizeStatuses(statuses: ServiceStatus[]): ServiceStatus[] {
  return (statuses || []).map(normalizeStatus);
}

export function useWebSocket() {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setIsReconnecting(false);
      ws.send(JSON.stringify({ type: "subscribe" }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "status") {
          // Merge new statuses with existing ones to preserve quota data
          // for services that weren't updated (prevents clearing numbers when adding services)
          setStatuses((prevStatuses) =>
            mergeStatuses(prevStatuses, normalizeStatuses(data.data as ServiceStatus[]), "full"),
          );
          setLastUpdate(new Date(data.ts * 1000));

          // Check for authentication errors and trigger UI alert
          const authErrors = (data.data as ServiceStatus[]).filter((status) => status.authError);
          if (authErrors.length > 0) {
            console.error(
              "Authentication errors detected:",
              authErrors.map((s) => s.service.name),
            );

            // Show browser alert for authentication failures
            const serviceNames = authErrors.map((s) => s.service.name).join(", ");
            alert(
              `⚠️ Authentication Failed: ${serviceNames}\n\nYour tokens may have expired or been revoked.\n\nPlease visit your AI provider and generate new tokens.\n\nAfter updating tokens, the dashboard will refresh automatically.`,
            );
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      setIsReconnecting(true);

      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("Attempting to reconnect...");
        connect();
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const reloadCached = useCallback(() => {
    fetch(`${API_URL}/status/cached`)
      .then((response) => response.json())
      .then((data) => {
        setStatuses((prevStatuses) =>
          mergeStatuses(prevStatuses, normalizeStatuses(data as ServiceStatus[]), "full"),
        );
        setLastUpdate(new Date());
      })
      .catch((error) => console.error("Error loading cached status:", error));
  }, []);

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
        // Endpoint returns a single ServiceStatus
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
