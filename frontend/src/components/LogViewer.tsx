import { RefreshCw, Terminal } from "lucide-react";
import { useLogs } from "../hooks/useLogs";
import type { LogEntry } from "shared/schemas";

interface LogViewerProps {
  enabled: boolean;
}

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  trace: "text-zinc-500",
  debug: "text-blue-400",
  info: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
  fatal: "text-red-300",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function LogViewer({ enabled }: LogViewerProps) {
  const { entries, loading, error, refresh } = useLogs(200, enabled);

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-zinc-500" />
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Logs</h3>
        </div>
        <button
          onClick={() => refresh()}
          disabled={!enabled || loading}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Refresh logs"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="mt-2 h-48 overflow-auto rounded-lg bg-zinc-900/60 border border-white/5">
        {error && <div className="p-3 text-xs text-red-400">{error}</div>}
        {!error && entries.length === 0 && (
          <div className="p-3 text-xs text-zinc-500">
            {enabled ? "No logs yet." : "Connect to load logs."}
          </div>
        )}
        {!error && entries.length > 0 && (
          <div className="p-3 space-y-1 text-xs font-mono text-zinc-300">
            {entries.map((entry, index) => (
              <div key={`${entry.ts}-${entry.level}-${index}`} className="flex items-start gap-2">
                <span className="text-zinc-600 shrink-0">{formatTimestamp(entry.ts)}</span>
                <span className={`uppercase tracking-wide shrink-0 ${LEVEL_STYLES[entry.level]}`}>
                  {entry.level}
                </span>
                <span className="text-zinc-200">
                  {entry.message.length > 0 ? entry.message : "(no message)"}
                </span>
                {entry.details && <span className="text-zinc-500 break-all">{entry.details}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
