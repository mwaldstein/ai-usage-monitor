import { useMemo } from "react";
import type { ServiceStatus, UsageHistory, UsageQuota } from "../types";

export interface TrendItem {
  key: string;
  serviceId: string;
  serviceName: string;
  metric: string;
  quota: UsageQuota;
  series: number[];
  delta: number;
  last: number;
  stroke: string;
  isBurnDown: boolean;
}

export function getTrendColor(delta: number, isBurnDown: boolean): string {
  if (isBurnDown) {
    return delta < 0 ? "#ef4444" : "#10b981";
  }
  return delta > 0 ? "#f59e0b" : "#3b82f6";
}

export interface UseDockTrendsOptions {
  history: UsageHistory[];
  statuses: ServiceStatus[];
  windowMinutes: number;
  maxTrends?: number;
}

export function useDockTrends({
  history,
  statuses,
  windowMinutes,
  maxTrends = 8,
}: UseDockTrendsOptions): TrendItem[] {
  return useMemo(() => {
    const now = Date.now();
    const sinceMs = now - windowMinutes * 60 * 1000;

    const quotaByKey = new Map<string, UsageQuota>();
    const serviceNameById = new Map<string, string>();

    for (const status of statuses) {
      serviceNameById.set(status.service.id, status.service.name);
      for (const q of status.quotas) {
        quotaByKey.set(`${q.serviceId}:${q.metric}`, q);
      }
    }

    const byKey = new Map<string, UsageHistory[]>();
    for (const row of history) {
      const tsMs = row.ts * 1000;
      if (!Number.isFinite(tsMs) || tsMs < sinceMs) continue;
      const key = `${row.serviceId}:${row.metric}`;
      const list = byKey.get(key) || [];
      list.push(row);
      byKey.set(key, list);
    }

    for (const list of byKey.values()) {
      list.sort((a, b) => a.ts - b.ts);
    }

    const out: TrendItem[] = [];

    for (const [key, list] of byKey) {
      if (list.length < 2) continue;
      const quota = quotaByKey.get(key);
      if (!quota) continue;

      const usedSeries = list.map((r) => r.value).filter((v) => Number.isFinite(v));
      if (usedSeries.length < 2) continue;

      let min = Infinity,
        max = -Infinity;
      for (const v of usedSeries) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      if (max - min < 0.01) continue;

      const quotaType = quota.type || "rate_limit";
      const isBurnDown = quotaType === "usage" || quotaType === "credits";

      let series: number[];
      let last: number;
      let delta: number;

      if (isBurnDown && quota.limit > 0) {
        series = usedSeries.map((v) => quota.limit - v);
        last = series[series.length - 1];
        delta = last - series[0];
      } else {
        series = usedSeries;
        last = series[series.length - 1];
        delta = last - series[0];
      }

      const serviceName =
        serviceNameById.get(quota.serviceId) || list[0]?.service_name || quota.serviceId;
      const stroke = getTrendColor(delta, isBurnDown);

      out.push({
        key,
        serviceId: quota.serviceId,
        serviceName,
        metric: quota.metric,
        quota,
        series,
        delta,
        last,
        stroke,
        isBurnDown,
      });
    }

    out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return out.slice(0, maxTrends);
  }, [history, statuses, windowMinutes, maxTrends]);
}
