export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
  details?: string;
}

const MAX_LOG_ENTRIES = 500;

const entries: LogEntry[] = [];

export function addLogEntry(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.splice(0, entries.length - MAX_LOG_ENTRIES);
  }
}

export function getLogEntries(limit: number): LogEntry[] {
  const safeLimit = Math.max(0, Math.min(limit, MAX_LOG_ENTRIES));
  if (safeLimit === 0) {
    return [];
  }
  return entries.slice(Math.max(0, entries.length - safeLimit));
}

export function getLogBufferSize(): number {
  return MAX_LOG_ENTRIES;
}
