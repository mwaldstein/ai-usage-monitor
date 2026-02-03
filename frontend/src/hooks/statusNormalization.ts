import type { ServiceStatus } from "../types";
import { getMetricAnnotation } from "../types/metricFormatters";

export type MergeMode = "full" | "partial";

export function mergeStatuses(
  prevStatuses: ServiceStatus[],
  newStatuses: ServiceStatus[],
  mode: MergeMode = "full",
): ServiceStatus[] {
  const mergedStatuses = [...prevStatuses];

  newStatuses.forEach((newStatus: ServiceStatus) => {
    const existingIndex = mergedStatuses.findIndex((s) => s.service.id === newStatus.service.id);

    if (existingIndex >= 0) {
      const existing = mergedStatuses[existingIndex];
      const shouldUpdate =
        newStatus.quotas.length > 0 || !existing.isHealthy || newStatus.error !== existing.error;

      if (shouldUpdate) {
        mergedStatuses[existingIndex] = newStatus;
      }
    } else {
      mergedStatuses.push(newStatus);
    }
  });

  if (mode === "full") {
    const newServiceIds = new Set(newStatuses.map((s: ServiceStatus) => s.service.id));
    const filtered = mergedStatuses.filter((s) => newServiceIds.has(s.service.id));
    return filtered.sort((a, b) => a.service.displayOrder - b.service.displayOrder);
  }

  return mergedStatuses.sort((a, b) => a.service.displayOrder - b.service.displayOrder);
}

function getMetricOrder(
  provider: string,
  metric: string,
  metadata?: { priority?: number },
): number {
  if (metadata?.priority !== undefined) {
    return metadata.priority;
  }

  const localDef = getMetricAnnotation(provider, metric);
  if (localDef?.priority !== undefined) {
    return localDef.priority;
  }

  if (metric.endsWith("_quota")) return 10;

  return 1000;
}

function normalizeStatus(status: ServiceStatus): ServiceStatus {
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

export function normalizeStatuses(statuses: ServiceStatus[]): ServiceStatus[] {
  return (statuses || []).map(normalizeStatus);
}
