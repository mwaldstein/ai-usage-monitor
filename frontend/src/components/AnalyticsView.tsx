import { useState, useCallback } from "react";
import { useUsageAnalytics, useProviderAnalytics } from "../hooks/useApi";
import type { AIService, ServiceStatus } from "../types";
import {
  useChartData,
  useChartKeys,
  useSummaryStats,
  useProviderData,
  type ChartDataPoint,
  type ProviderComparisonData,
  type TimeRange,
  type ChartMetric,
  type GroupBy,
  type Interval,
} from "../hooks/useAnalyticsData";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Calendar,
  Activity,
  Server,
  BarChart3,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface AnalyticsViewProps {
  services: AIService[];
  statuses?: ServiceStatus[];
  isConnected: boolean;
}

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#14B8A6",
];

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toFixed(0);
}

function formatChartTimestamp(ts: number, interval: Interval): string {
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

interface ChartControlsProps {
  interval: Interval;
  groupBy: GroupBy;
  chartMetric: ChartMetric;
  onIntervalChange: (interval: Interval) => void;
  onGroupByChange: (groupBy: GroupBy) => void;
  onChartMetricChange: (metric: ChartMetric) => void;
}

function ChartControls({
  interval,
  groupBy,
  chartMetric,
  onIntervalChange,
  onGroupByChange,
  onChartMetricChange,
}: ChartControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Interval:</span>
          <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
            {[
              { key: "5m", label: "5m" },
              { key: "15m", label: "15m" },
              { key: "1h", label: "1h" },
              { key: "4h", label: "4h" },
              { key: "1d", label: "1d" },
            ].map((i) => (
              <button
                key={i.key}
                onClick={() => onIntervalChange(i.key as Interval)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  interval === i.key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Group by:</span>
          <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
            {(["service", "provider", "metric"] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => onGroupByChange(g)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                  groupBy === g ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Metric:</span>
        <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
          {[
            { key: "used", label: "Used" },
            { key: "remaining", label: "Remaining" },
            { key: "utilization", label: "% Used" },
            { key: "remaining_pct", label: "% Left" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => onChartMetricChange(m.key as ChartMetric)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                chartMetric === m.key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimeSeriesChartProps {
  chartData: ChartDataPoint[];
  chartKeys: string[];
  timeRange: TimeRange;
  interval: Interval;
  groupBy: GroupBy;
}

function TimeSeriesChart({
  chartData,
  chartKeys,
  timeRange,
  interval,
  groupBy,
}: TimeSeriesChartProps) {
  return (
    <div className="glass rounded-xl p-4 border border-white/5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-300">Usage Trends Over Time</h3>
        <span className="text-xs text-zinc-500">
          Last {timeRange} days • {interval} intervals • Grouped by {groupBy}
        </span>
      </div>

      {chartData.length > 0 ? (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                tickFormatter={(value) => formatChartTimestamp(value, interval)}
                angle={interval === "5m" || interval === "15m" ? -45 : 0}
                textAnchor={interval === "5m" || interval === "15m" ? "end" : "middle"}
                height={interval === "5m" || interval === "15m" ? 60 : 30}
              />
              <YAxis
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                tickFormatter={(value) => formatNumber(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
                labelFormatter={(value) => formatChartTimestamp(Number(value), interval)}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              {chartKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-80 flex items-center justify-center text-zinc-500">
          <div className="text-center">
            <Activity size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No trend data available for selected period</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProviderComparisonChartProps {
  providerData: ProviderComparisonData[];
}

function ProviderComparisonChart({ providerData }: ProviderComparisonChartProps) {
  return (
    <div className="glass rounded-xl p-4 border border-white/5 mb-6">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">Provider Comparison</h3>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
          <BarChart data={providerData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
            <YAxis
              stroke="#71717a"
              fontSize={10}
              tickLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#a1a1aa" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar dataKey="total" fill="#3B82F6" name="Total Usage" radius={[4, 4, 0, 0]} />
            <Bar dataKey="average" fill="#10B981" name="Average" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AnalyticsView({ services, isConnected }: AnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [selectedService, setSelectedService] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("used");
  const [groupBy, setGroupBy] = useState<GroupBy>("service");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState<Interval>("1h");

  const {
    analytics,
    loading: analyticsLoading,
    error: analyticsError,
    refresh: refreshAnalytics,
  } = useUsageAnalytics(selectedService || undefined, timeRange, interval, groupBy);

  const {
    providerAnalytics,
    loading: providersLoading,
    error: providersError,
    refresh: refreshProviders,
  } = useProviderAnalytics(timeRange);

  const toggleCard = useCallback((cardId: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshAnalytics();
    refreshProviders();
  }, [refreshAnalytics, refreshProviders]);

  // Use extracted hooks for data processing
  const chartData = useChartData(
    analytics?.timeSeries,
    analytics?.quotas,
    groupBy,
    chartMetric,
    interval,
  );

  const chartKeys = useChartKeys(chartData);
  const summaryStats = useSummaryStats(analytics?.summary, analytics?.quotas, timeRange);
  const providerData = useProviderData(providerAnalytics);

  const loading = analyticsLoading || providersLoading;
  const error = analyticsError || providersError;

  return (
    <div className="min-h-screen bg-[#0f0f11] text-[#fafafa]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-violet-400" />
                <h1 className="text-lg font-semibold tracking-wide">Usage Analytics</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Service Filter */}
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="text-xs bg-zinc-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-violet-500/50"
              >
                <option value="">All Services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Time Range */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
                  {[1, 7, 30, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setTimeRange(days as TimeRange)}
                      disabled={analyticsLoading}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        timeRange === days
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-400 hover:text-white"
                      } ${analyticsLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRefresh}
                disabled={!isConnected || loading}
                className={`btn-icon tooltip ${!isConnected || loading ? "opacity-40 cursor-not-allowed" : ""}`}
                data-tooltip="Refresh data"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 py-4 pb-24">
        {error && (
          <div className="mb-4 glass rounded-xl p-4 border border-red-500/30 bg-red-950/20">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={16} />
              <span className="font-medium">Error loading analytics</span>
            </div>
            <p className="text-xs text-red-300/70 mt-1">{error}</p>
          </div>
        )}

        {/* Summary Stats Cards */}
        {summaryStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-violet-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Total Usage</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(summaryStats.totalConsumed)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Over {timeRange} days</div>
            </div>

            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Server size={14} className="text-emerald-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  Active Services
                </span>
              </div>
              <div className="text-2xl font-bold text-white">{summaryStats.activeServices}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {summaryStats.activeMetrics} metrics tracked
              </div>
            </div>

            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-amber-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">
                  Daily Average
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(summaryStats.avgDailyConsumption)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Per day consumption</div>
            </div>

            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Calendar
                  size={14}
                  className={
                    summaryStats.fastestDepletion && summaryStats.fastestDepletion.daysLeft < 7
                      ? "text-red-400"
                      : "text-blue-400"
                  }
                />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Depletion</span>
              </div>
              <div
                className={`text-2xl font-bold ${
                  summaryStats.fastestDepletion && summaryStats.fastestDepletion.daysLeft < 7
                    ? "text-red-400"
                    : "text-white"
                }`}
              >
                {summaryStats.fastestDepletion
                  ? summaryStats.fastestDepletion.daysLeft === Infinity
                    ? "∞"
                    : `${Math.ceil(summaryStats.fastestDepletion.daysLeft)}d`
                  : "N/A"}
              </div>
              <div className="text-xs text-zinc-500 mt-1 truncate">
                {summaryStats.fastestDepletion
                  ? `${summaryStats.fastestDepletion.service} - ${summaryStats.fastestDepletion.metric}`
                  : "No depletion data"}
              </div>
            </div>
          </div>
        )}

        {/* Chart Controls */}
        <ChartControls
          interval={interval}
          groupBy={groupBy}
          chartMetric={chartMetric}
          onIntervalChange={setInterval}
          onGroupByChange={setGroupBy}
          onChartMetricChange={setChartMetric}
        />

        {/* Time Series Chart */}
        <TimeSeriesChart
          chartData={chartData}
          chartKeys={chartKeys}
          timeRange={timeRange}
          interval={interval}
          groupBy={groupBy}
        />

        {/* Provider Comparison */}
        {providerData.length > 0 && <ProviderComparisonChart providerData={providerData} />}

        {/* Detailed Service Breakdown */}
        {analytics?.summary && analytics.summary.length > 0 && (
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => toggleCard("breakdown")}
            >
              <h3 className="text-sm font-semibold text-zinc-300">Detailed Service Breakdown</h3>
              {expandedCards.has("breakdown") ? (
                <ChevronUp size={16} className="text-zinc-400" />
              ) : (
                <ChevronDown size={16} className="text-zinc-400" />
              )}
            </div>

            {expandedCards.has("breakdown") && (
              <div className="border-t border-white/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-800/30">
                      <tr>
                        <th className="text-left p-3 text-zinc-400 font-medium">Service</th>
                        <th className="text-left p-3 text-zinc-400 font-medium">Metric</th>
                        <th className="text-right p-3 text-zinc-400 font-medium">Total</th>
                        <th className="text-right p-3 text-zinc-400 font-medium">Daily Avg</th>
                        <th className="text-right p-3 text-zinc-400 font-medium">Peak</th>
                        <th className="text-center p-3 text-zinc-400 font-medium">Active Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {analytics.summary.map((summary) => (
                        <tr
                          key={`${summary.serviceId}-${summary.metric}`}
                          className="hover:bg-white/5"
                        >
                          <td className="p-3 text-zinc-300">{summary.service_name}</td>
                          <td className="p-3 text-zinc-400">{summary.metric}</td>
                          <td className="p-3 text-right text-zinc-300">
                            {formatNumber(summary.total_consumed)}
                          </td>
                          <td className="p-3 text-right text-zinc-300">
                            {formatNumber(
                              summary.total_consumed / Math.max(1, summary.active_days),
                            )}
                          </td>
                          <td className="p-3 text-right text-zinc-300">
                            {formatNumber(summary.max_value)}
                          </td>
                          <td className="p-3 text-center text-zinc-400">{summary.active_days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
