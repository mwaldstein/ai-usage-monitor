import { useEffect, useMemo, useState } from 'react'
import { ServiceStatus, UsageHistory, UsageQuota } from '../types'
import { useUsageHistory } from '../hooks/useApi'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

type TrendItem = {
  key: string
  serviceId: string
  serviceName: string
  metric: string
  quota: UsageQuota
  series: number[]
  delta: number
  last: number
  stroke: string
  isBurnDown: boolean
}

function formatMetric(metric: string): string {
  return metric.replace(/_/g, ' ')
}

function BurnDownSparkline({
  values,
  color,
  width = 60,
  height = 24,
  isBurnDown = false,
}: {
  values: number[]
  color: string
  width?: number
  height?: number
  isBurnDown?: boolean
}) {
  if (!values.length) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // If no meaningful change, show flat line indicator
  if (range < 0.01) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-zinc-600 font-mono">—</span>
        <span className="text-[8px] text-zinc-700">no change</span>
      </div>
    )
  }

  // For burn down visualization, we want remaining to appear "full" at top
  // and deplete downward
  // Use width - 3 to leave room for the end point circle (radius 2.5 + padding)
  const plotWidth = width - 3
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * plotWidth
      // Invert Y so higher values are at top (like a fuel gauge)
      const normalizedY = (v - min) / range
      const y = 2 + (1 - normalizedY) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  // Calculate trend direction
  const startValue = values[0]
  const endValue = values[values.length - 1]
  const isDepleting = endValue < startValue
  const isReplenishing = endValue > startValue

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={width} height={height} className="opacity-90">
        {/* Gradient fill - different for burn down vs rate limit */}
        <defs>
          <linearGradient
            id={`dock-gradient-${color.replace('#', '')}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Background baseline for context */}
        <line
          x1="0"
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Area fill under the curve */}
        <polygon
          points={`0,${height - 2} ${points} ${width},${height - 2}`}
          fill={`url(#dock-gradient-${color.replace('#', '')})`}
        />

        {/* Main trend line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End point indicator - positioned at last data point */}
        <circle
          cx={width - 3}
          cy={2 + (1 - (endValue - min) / range) * (height - 4)}
          r="2.5"
          fill={color}
        />
      </svg>

      {/* Trend indicator text */}
      {isBurnDown && (
        <span
          className={`text-[8px] font-medium ${
            isDepleting ? 'text-red-400' : isReplenishing ? 'text-emerald-400' : 'text-zinc-500'
          }`}
        >
          {isDepleting ? '↓ burning' : isReplenishing ? '↑ refilling' : '→ steady'}
        </span>
      )}
    </div>
  )
}

function getTrendColor(delta: number, isBurnDown: boolean): string {
  if (isBurnDown) {
    // For burn down (credits/usage), negative delta is bad (using up resources)
    return delta < 0 ? '#ef4444' : '#10b981'
  }
  // For rate limits, positive delta means approaching limit (warning)
  return delta > 0 ? '#f59e0b' : '#3b82f6'
}

export function UsageDock({
  statuses,
  windowMinutes = 60,
}: {
  statuses: ServiceStatus[]
  windowMinutes?: number
}) {
  const historyHours = Math.max(1, windowMinutes / 60)
  const { history, loading, error, refresh } = useUsageHistory(undefined, historyHours)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (statuses.length === 0) return
    refresh()
  }, [statuses, refresh])

  const trends: TrendItem[] = useMemo(() => {
    const now = Date.now()
    const sinceMs = now - windowMinutes * 60 * 1000

    const quotaByKey = new Map<string, UsageQuota>()
    const serviceNameById = new Map<string, string>()

    for (const status of statuses) {
      serviceNameById.set(status.service.id, status.service.name)
      for (const q of status.quotas) {
        quotaByKey.set(`${q.serviceId}:${q.metric}`, q)
      }
    }

    // Group history by key
    const byKey = new Map<string, UsageHistory[]>()
    for (const row of history) {
      const ts = Date.parse(row.timestamp)
      if (!Number.isFinite(ts) || ts < sinceMs) continue
      const key = `${row.serviceId}:${row.metric}`
      const list = byKey.get(key) || []
      list.push(row)
      byKey.set(key, list)
    }

    for (const list of byKey.values()) {
      list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    }

    const out: TrendItem[] = []

    for (const [key, list] of byKey) {
      if (list.length < 2) continue
      const quota = quotaByKey.get(key)
      if (!quota) continue

      const usedSeries = list.map((r) => r.value).filter((v) => Number.isFinite(v))
      if (usedSeries.length < 2) continue

      // Check for meaningful variation (at least 0.01 difference)
      let min = Infinity,
        max = -Infinity
      for (const v of usedSeries) {
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
      if (max - min < 0.01) continue

      const quotaType = quota.type || 'rate_limit'
      const isBurnDown = quotaType === 'usage' || quotaType === 'credits'

      let series: number[]
      let last: number
      let delta: number

      if (isBurnDown && quota.limit > 0) {
        series = usedSeries.map((v) => quota.limit - v)
        last = series[series.length - 1]
        delta = last - series[0]
      } else {
        series = usedSeries
        last = series[series.length - 1]
        delta = last - series[0]
      }

      const serviceName =
        serviceNameById.get(quota.serviceId) || list[0]?.service_name || quota.serviceId
      const stroke = getTrendColor(delta, isBurnDown)

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
      })
    }

    // Sort by absolute movement
    out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    return out.slice(0, 8) // Limit to top 8 movers
  }, [history, statuses, windowMinutes])

  if (trends.length === 0 && !loading) return null

  const displayedTrends = isExpanded ? trends : trends.slice(0, 3)

  return (
    <div className="mt-4 glass rounded-xl overflow-hidden">
      {/* Dock Header */}
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

      {/* Trend Items */}
      {trends.length > 0 && (
        <div className="border-t border-white/5">
          {displayedTrends.map((trend) => {
            const deltaText = `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}`
            const valueText = trend.isBurnDown
              ? `${trend.last.toFixed(1)} / ${trend.quota.limit.toFixed(1)}`
              : `${trend.quota.used.toFixed(1)} / ${trend.quota.limit.toFixed(1)}`

            return (
              <div
                key={trend.key}
                className="px-3 py-2 flex items-center justify-between border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-zinc-300 truncate">
                      {trend.serviceName}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate">
                      {formatMetric(trend.metric)}
                    </span>
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
            )
          })}

          {/* Show More/Less */}
          {trends.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors border-t border-white/5"
            >
              {isExpanded ? 'Show less' : `Show ${trends.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="px-3 py-2 border-t border-white/5">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  )
}
