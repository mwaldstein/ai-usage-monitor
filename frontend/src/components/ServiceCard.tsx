import { useState, useMemo } from "react";
import type { ServiceStatus, UsageHistory } from "../types";
import { RefreshCw, ExternalLink, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { CompactQuota, MiniSparkline, getProviderColor } from "./ServiceCard/index";

interface ServiceCardProps {
  status: ServiceStatus;
  onRefresh: () => void;
  isSelected: boolean;
  onSelect: () => void;
  history?: UsageHistory[];
  viewMode?: "compact" | "expanded";
  isConnected?: boolean;
}

export function ServiceCard({
  status,
  onRefresh,
  isSelected,
  onSelect,
  history,
  viewMode = "compact",
  isConnected = true,
}: ServiceCardProps) {
  const { service, quotas, lastUpdated, isHealthy, error, authError } = status;
  const providerColor = getProviderColor(service.provider);
  const [isExpanded, setIsExpanded] = useState(false);

  const sparklineData = useMemo(() => {
    if (!quotas.length) return { values: [] as number[], isBurnDown: false };

    const firstQuota = quotas[0];
    const quotaType = firstQuota.type || "rate_limit";
    const isBurnDown = quotaType === "usage" || quotaType === "credits";

    if (history && history.length > 0) {
      const twoHoursAgoSec = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);

      const matchingHistory = history
        .filter((h) => h.serviceId === firstQuota.serviceId && h.metric === firstQuota.metric)
        .filter((h) => h.ts >= twoHoursAgoSec)
        .sort((a, b) => a.ts - b.ts);

      if (matchingHistory.length >= 3) {
        const rawValues = matchingHistory.map((h) => h.value).filter((v) => Number.isFinite(v));

        if (rawValues.length >= 3) {
          const series =
            isBurnDown && firstQuota.limit > 0
              ? rawValues.map((v) => firstQuota.limit - v)
              : rawValues;

          return { values: series, isBurnDown };
        }
      }
    }

    return { values: [] as number[], isBurnDown: false };
  }, [quotas, history]);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onSelect();
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      className={`glass rounded-xl overflow-hidden card-compact cursor-pointer ${
        isSelected ? "ring-1 ring-violet-500/50" : ""
      }`}
      onClick={handleCardClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1 h-8 rounded-full" style={{ backgroundColor: providerColor }} />

            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white truncate">{service.name}</h3>
                {isHealthy ? (
                  <CheckCircle2 size={12} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={12} className="text-red-500" />
                )}
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                {service.provider}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {viewMode !== "expanded" && (
              <MiniSparkline values={sparklineData.values} color={providerColor} />
            )}
            <button
              onClick={onRefresh}
              disabled={!isConnected}
              title={isConnected ? "Refresh" : "Offline - cannot refresh"}
              className={`p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {!isExpanded && quotas.length > 0 && (
          <div className="space-y-2">
            {quotas.slice(0, 2).map((quota) => (
              <CompactQuota
                key={quota.id}
                quota={quota}
                history={history}
                viewMode={viewMode}
                provider={service.provider}
              />
            ))}
            {quotas.length > 2 && (
              <button
                className="w-full py-1 text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1"
                onClick={() => setIsExpanded(true)}
              >
                <ChevronDown size={10} />
                {quotas.length - 2} more
              </button>
            )}
          </div>
        )}

        {authError && (
          <div className="mt-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-[10px] text-orange-400 flex items-center gap-1">
              <AlertCircle size={10} />
              Auth failed
            </p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const urls: Record<string, string> = {
                  zai: "https://z.ai",
                  opencode: "https://opencode.ai",
                  amp: "https://ampcode.com",
                  codex: "https://chatgpt.com",
                };
                window.open(urls[service.provider] || "#", "_blank");
              }}
              className="text-[10px] text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 mt-1"
            >
              Get token <ExternalLink size={8} />
            </a>
          </div>
        )}

        {!authError && error && (
          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {isExpanded && (
          <div className="mt-2 space-y-2 fade-in">
            {quotas.map((quota) => (
              <CompactQuota
                key={quota.id}
                quota={quota}
                history={history}
                viewMode={viewMode}
                provider={service.provider}
              />
            ))}
            <button
              className="w-full py-1 text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronDown size={10} className="rotate-180" />
              Show less
            </button>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
          <span>{new Date(lastUpdated * 1000).toLocaleTimeString()}</span>
          {quotas.some((q) => q.replenishmentRate && q.replenishmentRate.amount > 0) && (
            <span className="text-emerald-500">
              +{quotas[0].replenishmentRate?.amount.toFixed(2)}/
              {quotas[0].replenishmentRate?.period}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
