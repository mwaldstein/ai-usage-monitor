import { useState, useEffect, useCallback } from "react";
import type { UsageHistory, UsageAnalytics, ProviderAnalytics } from "../types";

import { getApiBaseUrl } from "../services/backendUrls";

const API_URL = getApiBaseUrl();

export function useUsageHistory(serviceId?: string, hours: number = 24) {
  const [history, setHistory] = useState<UsageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (serviceId) params.append("serviceId", serviceId);
      params.append("hours", hours.toString());

      const response = await fetch(`${API_URL}/usage/history?${params}`);
      if (!response.ok) throw new Error("Failed to fetch usage history");
      const data = await response.json();
      setHistory(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [serviceId, hours]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}

export function useUsageAnalytics(
  serviceId?: string,
  days: number = 30,
  interval: string = "1h",
  groupBy?: string,
) {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (serviceId) params.append("serviceId", serviceId);
      params.append("days", days.toString());
      params.append("interval", interval);
      if (groupBy) params.append("groupBy", groupBy);

      const response = await fetch(`${API_URL}/usage/analytics?${params}`);
      if (!response.ok) throw new Error("Failed to fetch usage analytics");
      const data = await response.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [serviceId, days, interval, groupBy]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refresh: fetchAnalytics };
}

export function useProviderAnalytics(days: number = 30) {
  const [providerAnalytics, setProviderAnalytics] = useState<ProviderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviderAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("days", days.toString());

      const response = await fetch(`${API_URL}/usage/analytics/providers?${params}`);
      if (!response.ok) throw new Error("Failed to fetch provider analytics");
      const data = await response.json();
      setProviderAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchProviderAnalytics();
  }, [fetchProviderAnalytics]);

  return { providerAnalytics, loading, error, refresh: fetchProviderAnalytics };
}
