import { useEffect, useState } from "react";
import type { ServiceStatus } from "../../types";
import { useUsageHistory } from "../../hooks/useApi";
import { useDockTrends, type TrendItem } from "../../hooks/useDockTrends";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { BurnDownSparkline } from "./BurnDownSparkline";
import { formatMetric } from "./utils";

function TrendItemRow({ trend }: { trend: TrendItem }) {
  const deltaText = `${trend.delta >= 0 ? "+" : ""}${trend.delta.toFixed(2)}`;
  const valueText = trend.isBurnDown
    ? `${trend.last.toFixed(1)} / ${trend.quota.limit.toFixed(1)}`
    : `${trend.quota.used.toFixed(1)} / ${trend.quota.limit.toFixed(1)}`;

  return (
    <div className="px-3 py-2 flex items-center justify-between border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-zinc-300 truncate">{trend.serviceName}</span>
          <span className="text-[10px] text-zinc-500 truncate">{formatMetric(trend.metric)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div
            className="text-xs font-semibold flex items-center justify-end gap-1"
            style={{ color: trend.stroke }}
          >
            {trend.delta > 0 ? (
              <TrendingUp size={10} />
            ) : trend.delta < 0 ? (
              <TrendingDown size={10} />
            ) : null}
            {deltaText}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">{valueText}</div>
        </div>
        <BurnDownSparkline
          values={trend.series}
          color={trend.stroke}
          isBurnDown={trend.isBurnDown}
        />
      </div>
    </div>
  );
}

interface UsageDockProps {
  statuses: ServiceStatus[];
  windowMinutes?: number;
}

export function UsageDock({ statuses, windowMinutes = 60 }: UsageDockProps) {
  const historyHours = Math.max(1, windowMinutes / 60);
  const { history, loading, error, refresh } = useUsageHistory(undefined, historyHours);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (statuses.length === 0) return;
    refresh();
  }, [statuses, refresh]);

  const trends = useDockTrends({ history, statuses, windowMinutes });

  if (trends.length === 0 && !loading) return null;

  const displayedTrends = isExpanded ? trends : trends.slice(0, 3);

  return (
    <div className="mt-4 glass rounded-xl overflow-hidden">
      <div
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-violet-400" />
          <span className="text-xs font-semibold text-zinc-300">Live Trends</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {windowMinutes >= 60 ? `${Math.round(windowMinutes / 60)}h` : `${windowMinutes}m`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {trends.length > 0 && (
            <span className="text-[10px] text-zinc-500">{trends.length} active</span>
          )}
          {loading && <span className="text-[10px] text-zinc-500">Loading...</span>}
        </div>
      </div>

      {trends.length > 0 && (
        <div className="border-t border-white/5">
          {displayedTrends.map((trend) => (
            <TrendItemRow key={trend.key} trend={trend} />
          ))}

          {trends.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
            >
              {isExpanded ? "Show less" : `Show ${trends.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 border-t border-white/5">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
