import { useState, useEffect, useMemo } from 'react';
import { ServiceStatus, UsageQuota, UsageHistory } from '../types';
import { RefreshCw, ExternalLink, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ServiceCardProps {
  status: ServiceStatus;
  onRefresh: () => void;
  isSelected: boolean;
  onSelect: () => void;
  history?: UsageHistory[];
}

function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return 'now';
  
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    opencode: '#8b5cf6',
    amp: '#06b6d4',
    zai: '#10b981',
    codex: '#f59e0b',
  };
  return colors[provider.toLowerCase()] || '#71717a';
}

// Radial Progress Component
function RadialProgress({ 
  percentage, 
  size = 36, 
  strokeWidth = 3, 
  color,
  children 
}: { 
  percentage: number; 
  size?: number; 
  strokeWidth?: number;
  color: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="radial-progress">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="radial-progress-circle"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// Compact Quota Display
function CompactQuota({
  quota,
  history,
}: {
  quota: UsageQuota;
  history?: UsageHistory[];
}) {
  const used = quota.used ?? 0;
  const remaining = quota.remaining ?? 0;
  const limit = quota.limit ?? 0;

  const quotaType = quota.type || 'rate_limit';
  const isBurnDown = quotaType === 'usage' || quotaType === 'credits';
  const percentage = limit > 0
    ? (isBurnDown ? (remaining / limit) : (used / limit)) * 100
    : 0;

  const isCritical = isBurnDown ? percentage < 10 : percentage > 90;
  const isWarning = isBurnDown ? percentage < 25 : percentage > 70;

  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    const calculateTime = () => {
      const reset = new Date(quota.resetAt);
      const now = new Date();
      const diffMs = reset.getTime() - now.getTime();
      setTimeRemaining(formatCountdown(diffMs));
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [quota.resetAt]);

  let color = '#10b981'; // green
  if (isCritical) color = '#ef4444'; // red
  else if (isWarning) color = '#f59e0b'; // amber

  const { trend, oneHourChange } = getQuotaTrend(quota, isBurnDown, history);
  
  // Build tooltip text showing 1-hour change in native units
  const getArrowTooltip = () => {
    if (!oneHourChange) return trend === 'depleting' ? 'Depleting' : trend === 'replenishing' ? 'Replenishing' : 'Stable';
    
    const metricLower = quota.metric.toLowerCase();
    const isCurrency = metricLower.includes('ubi') || metricLower.includes('credits') || metricLower.includes('$');
    const isPercentage = metricLower.includes('%') || metricLower.includes('percent') || metricLower.includes('rolling');
    
    // Format values based on metric type
    const formatValue = (val: number) => {
      if (isCurrency) return `$${val.toFixed(2)}`;
      if (isPercentage) return `${val.toFixed(1)}%`;
      return val.toFixed(1);
    };
    
    return `${oneHourChange.minutesAgo}m: ${formatValue(oneHourChange.from)} → ${formatValue(oneHourChange.to)}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
      <RadialProgress percentage={percentage} size={32} strokeWidth={2.5} color={color}>
        <span className="text-[10px] font-bold text-white">{Math.round(percentage)}%</span>
      </RadialProgress>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-300 truncate">
              {quota.metric.replace(/_/g, ' ')}
            </span>
            {trend === 'depleting' && (
              <span className="text-[10px] text-red-400 cursor-help" title={getArrowTooltip()}>▼</span>
            )}
            {trend === 'replenishing' && (
              <span className="text-[10px] text-emerald-400 cursor-help" title={getArrowTooltip()}>▲</span>
            )}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">{timeRemaining}</span>
        </div>
        <div className="text-[10px] text-zinc-500">
          {isBurnDown ? (
            <span>{remaining.toFixed(1)} / {limit.toFixed(1)} remaining</span>
          ) : (
            <span>{used.toFixed(1)} / {limit.toFixed(1)} used</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Calculate trend for a quota based on its type and usage pattern
// Returns trend type and 1-hour change in native units for tooltips
function getQuotaTrend(
  quota: UsageQuota,
  isBurnDown: boolean,
  history?: UsageHistory[]
): {
  trend: 'depleting' | 'replenishing' | 'stable';
  oneHourChange: { from: number; to: number; minutesAgo: number } | null;
} {
  const used = quota.used ?? 0;
  const remaining = quota.remaining ?? 0;
  const limit = quota.limit ?? 0;

  // Determine what value to track based on quota type.
  // We display remaining for burn-down quotas and used for rate limits.
  const currentValue = isBurnDown ? remaining : used;

  let trend: 'depleting' | 'replenishing' | 'stable' = 'stable';
  let oneHourChange: { from: number; to: number; minutesAgo: number } | null = null;

  // Try to find real historical data from the last 2 hours.
  // We pick the record closest to ~60 minutes ago, but fall back to the
  // oldest available point in that window.
  if (history && history.length > 0) {
    const nowMs = Date.now();
    const targetMs = nowMs - 60 * 60 * 1000;
    const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
    const fiveMinutesAgo = nowMs - 5 * 60 * 1000;

    const matchingEntries = history
      .filter((h) => h.serviceId === quota.serviceId && h.metric === quota.metric)
      .map((h) => ({ h, ts: Date.parse(h.timestamp) }))
      .filter(({ ts }) => Number.isFinite(ts) && ts >= twoHoursAgo && ts <= fiveMinutesAgo)
      .sort((a, b) => a.ts - b.ts); // oldest -> newest

    if (matchingEntries.length > 0) {
      let chosen = matchingEntries[0];
      let bestDist = Math.abs(chosen.ts - targetMs);
      for (const e of matchingEntries) {
        const d = Math.abs(e.ts - targetMs);
        if (d < bestDist) {
          bestDist = d;
          chosen = e;
        }
      }

      // usage_history.value is stored as the quota's "used" value.
      const historicalUsed = chosen.h.value;
      const historicalValue = isBurnDown && limit > 0 ? (limit - historicalUsed) : historicalUsed;
      const valueChange = currentValue - historicalValue;

      // Only show arrows when there is a real change.
      const epsilon = 0.01;
      if (Math.abs(valueChange) <= epsilon) {
        return { trend: 'stable', oneHourChange: null };
      }

      if (isBurnDown) {
        // For burn-down: decreasing remaining = depleting
        trend = valueChange < 0 ? 'depleting' : 'replenishing';
      } else {
        // For rate limits: increasing used = depleting
        trend = valueChange > 0 ? 'depleting' : 'replenishing';
      }

      const minutesAgo = Math.max(1, Math.round((nowMs - chosen.ts) / 60000));
      oneHourChange = { from: historicalValue, to: currentValue, minutesAgo };
      return { trend, oneHourChange };
    }
  }

  // No historical data found - don't show any trend arrow
  return { trend: 'stable', oneHourChange: null };
}

// Mini Sparkline for card header - shows burn down trend
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;

  // Keep the rendering stable: filter any non-finite points.
  values = values.filter(v => Number.isFinite(v));
  if (!values.length) return null;
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  // If no meaningful change, show flat line indicator instead of sparkline
  if (range < 0.01) {
    return (
      <span className="text-[10px] text-zinc-600 font-mono px-1">—</span>
    );
  }
  
  // For burn down, we want to show the depletion visually
  // Higher values at the top, lower at bottom (like a fuel gauge emptying)
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 40;
    // Normalize to SVG height (2px padding top/bottom)
    const normalizedY = ((v - min) / range);
    const y = 2 + (1 - normalizedY) * 10; // Invert so high values are at top
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="40" height="14" className="opacity-70">
      {/* Gradient fill under the line */}
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      <polygon
        points={`0,12 ${points} 40,12`}
        fill={`url(#spark-fill-${color.replace('#', '')})`}
      />
      
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ServiceCard({
  status,
  onRefresh,
  isSelected,
  onSelect,
  history,
}: ServiceCardProps) {
  const { service, quotas, lastUpdated, isHealthy, error, authError } = status;
  const providerColor = getProviderColor(service.provider);
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate health score
  const healthScore = useMemo(() => {
    if (!quotas.length) return 100;
    let critical = 0;
    let warning = 0;
    quotas.forEach(q => {
      const pct = q.limit > 0 ? (q.used / q.limit) * 100 : 0;
      if (pct > 90) critical++;
      else if (pct > 70) warning++;
    });
    if (critical > 0) return 33;
    if (warning > 0) return 66;
    return 100;
  }, [quotas]);

  // Determine health color
  const healthColor = healthScore > 80 ? '#10b981' : healthScore > 50 ? '#f59e0b' : '#ef4444';

  // Generate burn down sparkline data from first quota using actual history
  const sparklineData = useMemo(() => {
    if (!quotas.length) return { values: [], isBurnDown: false };

    const firstQuota = quotas[0];
    const quotaType = firstQuota.type || 'rate_limit';
    const isBurnDown = quotaType === 'usage' || quotaType === 'credits';

    // Try to use actual historical data
    if (history && history.length > 0) {
      // Calculate 2 hours ago
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

      // Filter history entries for this quota's serviceId and metric from last 2 hours
      const matchingHistory = history
        .filter(h => h.serviceId === firstQuota.serviceId && h.metric === firstQuota.metric)
        .filter(h => new Date(h.timestamp).getTime() >= twoHoursAgo)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Oldest to newest

      if (matchingHistory.length >= 3) {
        const rawValues = matchingHistory
          .map(h => h.value)
          .filter(v => Number.isFinite(v));

        if (rawValues.length >= 3) {
          // usage_history.value is stored as the quota's "used" value.
          // For burn-down quotas, display remaining by inverting around the limit.
          const series = (isBurnDown && firstQuota.limit > 0)
            ? rawValues.map(v => firstQuota.limit - v)
            : rawValues;

          return { values: series, isBurnDown };
        }
      }
    }

    // No (or insufficient) history available: don't render a sparkline.
    return { values: [], isBurnDown };
  }, [quotas, history]);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't expand if clicking refresh button
    if ((e.target as HTMLElement).closest('button')) return;
    onSelect();
    setIsExpanded(!isExpanded);
  };

  return (
    <div 
      className={`glass rounded-xl overflow-hidden card-compact cursor-pointer ${
        isSelected ? 'ring-1 ring-violet-500/50' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Card Header */}
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* Provider Color Indicator */}
            <div 
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: providerColor }}
            />
            
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white truncate">{service.name}</h3>
                {isHealthy ? (
                  <CheckCircle2 size={12} className="text-emerald-500" />
                ) : (
                  <AlertCircle size={12} className="text-red-500" />
                )}
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{service.provider}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <MiniSparkline 
              values={sparklineData.values} 
              color={providerColor}
            />
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Health Score Bar */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${healthScore}%`,
                backgroundColor: healthColor,
                boxShadow: `0 0 8px ${healthColor}40`
              }}
            />
          </div>
          <span className="text-[10px] font-medium" style={{ color: healthColor }}>
            {healthScore}%
          </span>
        </div>

        {/* Compact Quota Preview (first 2) */}
        {!isExpanded && quotas.length > 0 && (
          <div className="space-y-1">
            {quotas.slice(0, 2).map(quota => (
              <CompactQuota key={quota.id} quota={quota} history={history} />
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

        {/* Auth Error Alert */}
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
                  zai: 'https://z.ai',
                  opencode: 'https://opencode.ai',
                  amp: 'https://ampcode.com',
                  codex: 'https://chatgpt.com',
                };
                window.open(urls[service.provider] || '#', '_blank');
              }}
              className="text-[10px] text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 mt-1"
            >
              Get token <ExternalLink size={8} />
            </a>
          </div>
        )}

        {/* Regular Error */}
        {!authError && error && (
          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {/* Expanded View - All Quotas */}
        {isExpanded && (
          <div className="mt-2 space-y-1 fade-in">
            {quotas.map(quota => (
              <CompactQuota key={quota.id} quota={quota} history={history} />
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

        {/* Last Updated */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
          <span>{new Date(lastUpdated).toLocaleTimeString()}</span>
          {quotas.some(q => q.replenishmentRate && q.replenishmentRate.amount > 0) && (
            <span className="text-emerald-500">
              +{quotas[0].replenishmentRate?.amount.toFixed(2)}/{quotas[0].replenishmentRate?.period}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
