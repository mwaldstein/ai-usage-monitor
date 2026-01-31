import { useState, useEffect, useMemo } from "react";
import type { UsageQuota, UsageHistory } from "../../types";
import {
  getEffectiveMetricAnnotation,
  formatMetricValue,
  getMetricDisplayName,
} from "../../types/metricFormatters";
import { RadialProgress } from "./RadialProgress";
import { QuotaSparkline } from "./QuotaSparkline";
import { formatCountdown, getQuotaTrend } from "./utils";

interface CompactQuotaProps {
  quota: UsageQuota;
  history?: UsageHistory[];
  viewMode?: "compact" | "expanded";
  provider: string;
}

export function CompactQuota({
  quota,
  history,
  viewMode = "compact",
  provider,
}: CompactQuotaProps) {
  const used = quota.used ?? 0;
  const remaining = quota.remaining ?? 0;
  const limit = quota.limit ?? 0;

  const annotation = getEffectiveMetricAnnotation(provider, quota.metric, quota.metricMetadata);

  const quotaType = quota.type || "rate_limit";
  const isBurnDown = quotaType === "usage" || quotaType === "credits";
  const percentage = limit > 0 ? (isBurnDown ? remaining / limit : used / limit) * 100 : 0;

  const warnThreshold = annotation.warnThreshold ?? (isBurnDown ? 25 : 70);
  const errorThreshold = annotation.errorThreshold ?? (isBurnDown ? 10 : 90);

  const isCritical = isBurnDown ? percentage < errorThreshold : percentage > errorThreshold;
  const isWarning = isBurnDown ? percentage < warnThreshold : percentage > warnThreshold;

  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    const calculateTime = () => {
      const resetMs = quota.resetAt * 1000;
      const diffMs = resetMs - Date.now();
      setTimeRemaining(formatCountdown(diffMs));
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [quota.resetAt]);

  let color = "#10b981";
  if (isCritical) color = "#ef4444";
  else if (isWarning) color = "#f59e0b";

  const { trend, oneHourChange } = getQuotaTrend(quota, isBurnDown, history);

  const sparklineData = useMemo(() => {
    if (viewMode !== "expanded" || !history || history.length === 0) return [];

    const twoHoursAgoSec = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
    const matchingHistory = history
      .filter((h) => h.serviceId === quota.serviceId && h.metric === quota.metric)
      .filter((h) => h.ts >= twoHoursAgoSec)
      .sort((a, b) => a.ts - b.ts);

    if (matchingHistory.length < 2) return [];

    const usedSeries = matchingHistory.map((h) => h.value).filter((v) => Number.isFinite(v));

    if (usedSeries.length < 2) return [];

    if (isBurnDown && quota.limit > 0) {
      return usedSeries.map((v) => quota.limit - v);
    }
    return usedSeries;
  }, [history, quota, isBurnDown, viewMode]);

  const delta =
    sparklineData.length > 1 ? sparklineData[sparklineData.length - 1] - sparklineData[0] : 0;
  const deltaText = `${delta >= 0 ? "+" : ""}${formatMetricValue(delta, annotation)}`;

  const getArrowTooltip = () => {
    if (!oneHourChange)
      return trend === "depleting"
        ? "Depleting"
        : trend === "replenishing"
          ? "Replenishing"
          : "Stable";

    return `${oneHourChange.minutesAgo}m: ${formatMetricValue(oneHourChange.from, annotation)} → ${formatMetricValue(oneHourChange.to, annotation)}`;
  };

  const displayRemaining = formatMetricValue(remaining, annotation);
  const displayUsed = formatMetricValue(used, annotation);
  const displayLimit = formatMetricValue(limit, annotation);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
      <RadialProgress percentage={percentage} size={44} strokeWidth={3.5} color={color}>
        <span className="text-sm font-bold text-white">{Math.round(percentage)}%</span>
      </RadialProgress>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-300 truncate">
              {getMetricDisplayName(provider, quota.metric, quota.metricMetadata)}
            </span>
            {trend === "depleting" && (
              <span className="text-[10px] text-red-400 cursor-help" title={getArrowTooltip()}>
                ▼
              </span>
            )}
            {trend === "replenishing" && (
              <span className="text-[10px] text-emerald-400 cursor-help" title={getArrowTooltip()}>
                ▲
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewMode === "expanded" && sparklineData.length > 1 && (
              <span
                className={`text-xs font-semibold ${delta < 0 ? "text-red-400" : delta > 0 ? "text-emerald-400" : "text-zinc-400"}`}
              >
                {deltaText}
              </span>
            )}
            <span className="text-xs text-zinc-300 font-mono">{timeRemaining}</span>
          </div>
        </div>
        <div className="text-[10px] text-zinc-500">
          {isBurnDown ? (
            <span>
              {displayRemaining} / {displayLimit} remaining
            </span>
          ) : (
            <span>
              {displayUsed} / {displayLimit} used
            </span>
          )}
        </div>
      </div>

      {viewMode === "expanded" && sparklineData.length > 1 && (
        <QuotaSparkline values={sparklineData} color={color} isBurnDown={isBurnDown} />
      )}
    </div>
  );
}
