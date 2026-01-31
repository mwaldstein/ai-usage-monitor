import { useEffect, useMemo } from "react";
import type { ServiceStatus, UsageHistory, UsageQuota } from "../types";
import { useUsageHistory } from "../hooks/useApi";

type TrendRow = {
  key: string;
  serviceId: string;
  serviceName: string;
  metric: string;
  quota: UsageQuota;
  series: number[];
  delta: number;
  last: number;
};

function formatMetric(metric: string): string {
  return metric.replace(/_/g, " ");
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function Sparkline({
  values,
  width,
  height,
  stroke,
}: {
  values: number[];
  width: number;
  height: number;
  stroke: string;
}) {
  const padding = 2;

  const { points, hasVariation } = useMemo(() => {
    if (!values.length) return { points: "", hasVariation: false };

    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }

    if (min === Infinity || max === -Infinity) return { points: "", hasVariation: false };

    const range = max - min;
    const usableW = Math.max(1, width - padding * 2);
    const usableH = Math.max(1, height - padding * 2);

    const pts: string[] = [];
    const denom = Math.max(1, values.length - 1);
    for (let i = 0; i < values.length; i++) {
      const x = padding + (usableW * i) / denom;
      const norm = range > 0 ? (values[i] - min) / range : 0.5;
      const y = padding + (1 - clamp(norm, 0, 1)) * usableH;
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return { points: pts.join(" "), hasVariation: range > 0 };
  }, [values, width, height]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={hasVariation ? 1 : 0.6}
      />
    </svg>
  );
}

function pickDisplaySeries(
  quota: UsageQuota,
  usedSeries: number[],
): { series: number[]; last: number; delta: number; label: "used" | "remaining" } {
  const quotaType = quota.type || "rate_limit";
  const isBurnDown = quotaType === "usage" || quotaType === "credits";

  if (!isBurnDown || !(quota.limit > 0)) {
    const first = usedSeries[0] ?? 0;
    const last = usedSeries[usedSeries.length - 1] ?? 0;
    return { series: usedSeries, last, delta: last - first, label: "used" };
  }

  const remainingSeries = usedSeries.map((v) => quota.limit - v);
  const first = remainingSeries[0] ?? 0;
  const last = remainingSeries[remainingSeries.length - 1] ?? 0;
  return { series: remainingSeries, last, delta: last - first, label: "remaining" };
}

function groupHistory(history: UsageHistory[], sinceMs: number) {
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

  return byKey;
}

export function UsageTrends({
  statuses,
  windowMinutes = 60,
}: {
  statuses: ServiceStatus[];
  windowMinutes?: number;
}) {
  // Query a bit wider than our display window to allow for clock skew + sparse refresh intervals.
  const historyHours = Math.max(1, windowMinutes / 60);
  const { history, loading, error, refresh } = useUsageHistory(undefined, historyHours);

  useEffect(() => {
    if (statuses.length === 0) return;
    refresh();
  }, [statuses, refresh]);

  const rows: TrendRow[] = useMemo(() => {
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

    const byKey = groupHistory(history, sinceMs);

    const out: TrendRow[] = [];
    for (const [key, list] of byKey) {
      if (list.length < 2) continue;
      const quota = quotaByKey.get(key);
      if (!quota) continue;

      const usedSeries = list.map((r) => r.value).filter((v) => Number.isFinite(v));

      if (usedSeries.length < 2) continue;

      // Only include quotas that changed within the window.
      let min = Infinity;
      let max = -Infinity;
      for (const v of usedSeries) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      if (!(max > min)) continue;

      const { series, last, delta } = pickDisplaySeries(quota, usedSeries);

      const serviceId = quota.serviceId;
      const serviceName =
        serviceNameById.get(serviceId) || list[list.length - 1]?.service_name || serviceId;

      out.push({
        key,
        serviceId,
        serviceName,
        metric: quota.metric,
        quota,
        series,
        delta,
        last,
      });
    }

    // Sort by absolute movement (largest first).
    out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return out;
  }, [history, statuses, windowMinutes]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h3 className="text-lg font-semibold">Usage Trends</h3>
        <span className="text-xs text-gray-500 font-mono">{windowMinutes}m</span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading && statuses.length > 0 && (
        <p className="text-sm text-gray-500">Loading recent usage…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          No quotas changed in the last {windowMinutes} minutes.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const quotaType = row.quota.type || "rate_limit";
            const isBurnDown = quotaType === "usage" || quotaType === "credits";
            const stroke = isBurnDown ? (row.delta < 0 ? "#ef4444" : "#16a34a") : "#2563eb";

            const metricLabel = formatMetric(row.metric);
            const deltaText = `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(2)}`;

            const valueText = isBurnDown
              ? `${row.last.toFixed(2)} / ${row.quota.limit.toFixed(2)} remaining`
              : `${row.quota.used.toFixed(2)} / ${row.quota.limit.toFixed(2)} used`;

            return (
              <div key={row.key} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {row.serviceName}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{metricLabel}</div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className={`text-sm font-semibold ${stroke === "#ef4444" ? "text-red-600" : stroke === "#16a34a" ? "text-green-700" : "text-blue-700"}`}
                    >
                      {deltaText}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">{valueText}</div>
                  </div>
                  <Sparkline values={row.series} width={120} height={32} stroke={stroke} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
