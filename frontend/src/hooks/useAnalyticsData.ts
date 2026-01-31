import { useMemo } from "react";
import type {
  TimeSeriesData,
  AnalyticsSummary,
  QuotaWithService,
  ProviderAnalytics,
} from "../types";

export type TimeRange = 1 | 7 | 30 | 90;
export type ChartMetric = "used" | "remaining" | "utilization" | "remaining_pct";
export type GroupBy = "service" | "provider" | "metric";
export type Interval = "5m" | "15m" | "1h" | "4h" | "1d";

export interface ChartDataPoint {
  ts: number;
  displayTime: string;
  [key: string]: number | string;
}

export interface SummaryStats {
  totalConsumed: number;
  activeServices: number;
  activeMetrics: number;
  avgDailyConsumption: number;
  fastestDepletion: DepletionInfo | null;
}

export interface DepletionInfo {
  service: string;
  metric: string;
  daysLeft: number;
  utilization: number;
}

export interface ProviderComparisonData {
  name: string;
  total: number;
  average: number;
  peak: number;
  services: number;
}

function formatTimestamp(ts: number, interval: Interval): string {
  const date = new Date(ts * 1000);

  switch (interval) {
    case "5m":
    case "15m":
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    case "1h":
    case "4h":
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true })
      );
    case "1d":
    default:
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

export function useChartData(
  timeSeries: TimeSeriesData[] | undefined,
  quotas: QuotaWithService[] | undefined,
  groupBy: GroupBy,
  chartMetric: ChartMetric,
  interval: Interval,
): ChartDataPoint[] {
  return useMemo(() => {
    if (!timeSeries) return [];

    const quotaLimits = new Map<string, number>();
    const quotaTypes = new Map<string, "usage" | "credits" | "rate_limit">();

    if (quotas) {
      quotas.forEach((quota) => {
        const key =
          groupBy === "metric"
            ? quota.metric
            : groupBy === "provider"
              ? quota.provider
              : `${quota.service_name}:${quota.metric}`;

        if (!quotaLimits.has(key)) {
          quotaLimits.set(key, quota.limit);
          quotaTypes.set(key, quota.type || "rate_limit");
        }
      });
    }

    const byTimestamp = new Map<number, ChartDataPoint>();

    timeSeries.forEach((point) => {
      const ts = point.ts;
      if (!byTimestamp.has(ts)) {
        byTimestamp.set(ts, {
          ts,
          displayTime: formatTimestamp(ts, interval),
        });
      }

      const entry = byTimestamp.get(ts)!;

      let key: string;
      if (groupBy === "metric") {
        key = point.metric;
      } else if (groupBy === "provider") {
        key = point.provider;
      } else {
        key =
          point.service_name === "All Services"
            ? point.metric
            : `${point.service_name}:${point.metric}`;
      }

      const usageValue = point.max_value;
      const limit = quotaLimits.get(key) || 0;
      const quotaType = quotaTypes.get(key) || "rate_limit";
      const isBurnDown = quotaType === "usage" || quotaType === "credits";

      let value: number;
      if (chartMetric === "used") {
        value = isBurnDown && limit > 0 ? limit - usageValue : usageValue;
      } else if (chartMetric === "remaining") {
        value = limit > 0 ? Math.max(0, limit - usageValue) : 0;
      } else if (chartMetric === "remaining_pct") {
        const remaining = limit > 0 ? Math.max(0, limit - usageValue) : 0;
        value = limit > 0 ? (remaining / limit) * 100 : 0;
      } else {
        value = limit > 0 ? (usageValue / limit) * 100 : 0;
      }

      entry[key] = value;
    });

    return Array.from(byTimestamp.values()).sort((a, b) => a.ts - b.ts);
  }, [timeSeries, quotas, groupBy, chartMetric, interval]);
}

export function useChartKeys(chartData: ChartDataPoint[]): string[] {
  return useMemo(() => {
    if (chartData.length === 0) return [];
    const allKeys = new Set<string>();
    chartData.forEach((point) => {
      Object.keys(point).forEach((key) => {
        if (key !== "ts" && key !== "displayTime") {
          allKeys.add(key);
        }
      });
    });
    return Array.from(allKeys).slice(0, 8);
  }, [chartData]);
}

export function useSummaryStats(
  summary: AnalyticsSummary[] | undefined,
  quotas: QuotaWithService[] | undefined,
  timeRange: TimeRange,
): SummaryStats | null {
  return useMemo(() => {
    if (!summary || summary.length === 0) return null;

    const totalConsumed = summary.reduce((sum, s) => sum + s.total_consumed, 0);
    const activeServices = new Set(summary.map((s) => s.serviceId)).size;
    const activeMetrics = new Set(summary.map((s) => s.metric)).size;
    const avgDailyConsumption = totalConsumed / timeRange;

    let fastestDepletion: DepletionInfo | null = null;

    summary.forEach((s) => {
      const quota = quotas?.find((q) => q.serviceId === s.serviceId && q.metric === s.metric);

      if (quota && quota.limit > 0 && s.total_consumed > 0) {
        const dailyRate = s.total_consumed / Math.max(1, s.active_days);
        const remaining = quota.limit - quota.used;
        const daysLeft = dailyRate > 0 ? remaining / dailyRate : Infinity;
        const utilization = (quota.used / quota.limit) * 100;

        if (!fastestDepletion || (daysLeft < fastestDepletion.daysLeft && daysLeft > 0)) {
          fastestDepletion = {
            service: s.service_name,
            metric: s.metric,
            daysLeft,
            utilization,
          };
        }
      }
    });

    return {
      totalConsumed,
      activeServices,
      activeMetrics,
      avgDailyConsumption,
      fastestDepletion,
    };
  }, [summary, quotas, timeRange]);
}

export function useProviderData(
  providerAnalytics: ProviderAnalytics | null | undefined,
): ProviderComparisonData[] {
  return useMemo(() => {
    if (!providerAnalytics?.providers) return [];
    return providerAnalytics.providers.map((p) => ({
      name: p.provider,
      total: p.total_usage,
      average: p.avg_usage,
      peak: p.peak_usage,
      services: p.service_count,
    }));
  }, [providerAnalytics]);
}
