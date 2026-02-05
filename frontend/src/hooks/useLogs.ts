import { useCallback, useEffect, useState } from "react";
import { Schema as S, Either } from "effect";
import { LogsResponse } from "shared/api";
import type { LogEntry } from "shared/schemas";
import { getApiBaseUrl } from "../services/backendUrls";

const API_URL = getApiBaseUrl();

export function useLogs(limit = 200, enabled = true) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/logs?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }
      const data: unknown = await response.json();
      const decoded = S.decodeUnknownEither(LogsResponse)(data);
      if (Either.isLeft(decoded)) {
        throw new Error("Invalid logs response");
      }
      const nextEntries = Array.from(decoded.right.entries, (entry) => ({ ...entry }));
      setEntries(nextEntries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    if (!enabled) return;
    void fetchLogs();
  }, [enabled, fetchLogs]);

  return {
    entries,
    loading,
    error,
    refresh: fetchLogs,
  };
}
