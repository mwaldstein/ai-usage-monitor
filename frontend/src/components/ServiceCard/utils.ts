import type { UsageHistory, UsageQuota } from "../../types";

export function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return "now";

  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    opencode: "#8b5cf6",
    amp: "#06b6d4",
    zai: "#10b981",
    codex: "#f59e0b",
  };
  return colors[provider.toLowerCase()] || "#71717a";
}

export function getQuotaTrend(
  quota: UsageQuota,
  isBurnDown: boolean,
  history?: UsageHistory[],
): {
  trend: "depleting" | "replenishing" | "stable";
  oneHourChange: { from: number; to: number; minutesAgo: number } | null;
} {
  const used = quota.used ?? 0;
  const remaining = quota.remaining ?? 0;
  const limit = quota.limit ?? 0;

  const currentValue = isBurnDown ? remaining : used;

  let trend: "depleting" | "replenishing" | "stable" = "stable";
  let oneHourChange: { from: number; to: number; minutesAgo: number } | null = null;

  if (history && history.length > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const targetSec = nowSec - 60 * 60;
    const twoHoursAgoSec = nowSec - 2 * 60 * 60;
    const fiveMinutesAgoSec = nowSec - 5 * 60;

    const matchingEntries = history
      .filter((h) => h.serviceId === quota.serviceId && h.metric === quota.metric)
      .filter((h) => Number.isFinite(h.ts) && h.ts >= twoHoursAgoSec && h.ts <= fiveMinutesAgoSec)
      .sort((a, b) => a.ts - b.ts);

    if (matchingEntries.length > 0) {
      let chosen = matchingEntries[0];
      let bestDist = Math.abs(chosen.ts - targetSec);
      for (const e of matchingEntries) {
        const d = Math.abs(e.ts - targetSec);
        if (d < bestDist) {
          bestDist = d;
          chosen = e;
        }
      }

      const historicalUsed = chosen.value;
      const historicalValue = isBurnDown && limit > 0 ? limit - historicalUsed : historicalUsed;
      const valueChange = currentValue - historicalValue;

      const epsilon = 0.01;
      if (Math.abs(valueChange) <= epsilon) {
        return { trend: "stable", oneHourChange: null };
      }

      if (isBurnDown) {
        trend = valueChange < 0 ? "depleting" : "replenishing";
      } else {
        trend = valueChange > 0 ? "depleting" : "replenishing";
      }

      const minutesAgo = Math.max(1, Math.round((nowSec - chosen.ts) / 60));
      oneHourChange = { from: historicalValue, to: currentValue, minutesAgo };
      return { trend, oneHourChange };
    }
  }

  return { trend: "stable", oneHourChange: null };
}
