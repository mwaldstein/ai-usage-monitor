import { useEffect, useRef, useState, useCallback } from 'react';
import { ServiceStatus } from '../types';

const WS_URL = `ws://localhost:3001`;

type MergeMode = 'full' | 'partial';

// Merge helper function to preserve quota data
function mergeStatuses(prevStatuses: ServiceStatus[], newStatuses: ServiceStatus[], mode: MergeMode = 'full'): ServiceStatus[] {
  const mergedStatuses = [...prevStatuses];
  
  newStatuses.forEach((newStatus: ServiceStatus) => {
    const existingIndex = mergedStatuses.findIndex(
      s => s.service.id === newStatus.service.id
    );
    
    if (existingIndex >= 0) {
      // Only update if the new status has quotas or if the service state changed
      // This prevents clearing numbers when a service is temporarily empty during refresh
      const existing = mergedStatuses[existingIndex];
      const shouldUpdate = newStatus.quotas.length > 0 || 
                         !existing.isHealthy || 
                         newStatus.error !== existing.error;
      
      if (shouldUpdate) {
        mergedStatuses[existingIndex] = newStatus;
      }
    } else {
      // New service, add it
      mergedStatuses.push(newStatus);
    }
  });
  
  if (mode === 'full') {
    // Remove services that no longer exist
    const newServiceIds = new Set(newStatuses.map((s: ServiceStatus) => s.service.id));
    return mergedStatuses.filter(s => newServiceIds.has(s.service.id));
  }

  // Partial updates shouldn't prune other services.
  return mergedStatuses;
}

const METRIC_ORDER: Record<string, number> = {
  // Codex
  rolling_5hour: 10,
  weekly: 20,
  code_reviews: 30,
  credits: 40,

  // OpenAI
  monthly_spend_limit: 10,
  monthly_spend_soft_limit: 20,

  // OpenCode
  rolling_5hour_usage: 10,
  weekly_usage: 20,
  monthly_usage: 30,
  account_balance: 40,
  subscription_plan: 50,

  // AMP
  billing_balance: 20,

  // Common rate limits
  requests_per_minute: 10,
  tokens_per_minute: 20,
  requests_per_day: 30
};

function getMetricOrder(metric: string): number {
  const direct = METRIC_ORDER[metric];
  if (direct !== undefined) return direct;

  // AMP (and similar) often uses a primary "*_quota" metric.
  if (metric.endsWith('_quota')) return 10;

  return 1000;
}

function normalizeStatus(status: ServiceStatus): ServiceStatus {
  // Filter legacy/derived metrics that were previously stored as standalone quotas.
  // We now represent these via `replenishmentRate` + `resetAt` on the main quota.
  const hiddenMetrics = new Set(['hourly_replenishment', 'window_hours']);

  const quotas = [...(status.quotas || [])]
    .filter(q => !hiddenMetrics.has(q.metric))
    .sort((a, b) => {
    const ao = getMetricOrder(a.metric);
    const bo = getMetricOrder(b.metric);
    if (ao !== bo) return ao - bo;
    return a.metric.localeCompare(b.metric);
  });

  return { ...status, quotas };
}

function normalizeStatuses(statuses: ServiceStatus[]): ServiceStatus[] {
  return (statuses || []).map(normalizeStatus);
}

export function useWebSocket() {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe' }));
    };

      ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status') {
          // Merge new statuses with existing ones to preserve quota data
          // for services that weren't updated (prevents clearing numbers when adding services)
          setStatuses(prevStatuses => mergeStatuses(prevStatuses, normalizeStatuses(data.data as ServiceStatus[]), 'full'));
          setLastUpdate(new Date(data.timestamp));
          
          // Check for authentication errors and trigger UI alert
          const authErrors = (data.data as ServiceStatus[]).filter(status => status.authError);
          if (authErrors.length > 0) {
            console.error('Authentication errors detected:', authErrors.map(s => s.service.name));
            
            // Show browser alert for authentication failures
            const serviceNames = authErrors.map(s => s.service.name).join(', ');
            alert(`⚠️ Authentication Failed: ${serviceNames}\n\nYour tokens may have expired or been revoked.\n\nPlease visit your AI provider and generate new tokens.\n\nAfter updating tokens, the dashboard will refresh automatically.`);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      // Reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const reloadCached = useCallback(() => {
    fetch('http://localhost:3001/api/status/cached')
      .then(response => response.json())
      .then(data => {
        setStatuses(prevStatuses => mergeStatuses(prevStatuses, normalizeStatuses(data as ServiceStatus[]), 'full'));
        setLastUpdate(new Date());
      })
      .catch(error => console.error('Error loading cached status:', error));
  }, []);

  const refresh = useCallback(() => {
    fetch('http://localhost:3001/api/quotas/refresh', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        setStatuses(prevStatuses => mergeStatuses(prevStatuses, normalizeStatuses(data as ServiceStatus[]), 'full'));
        setLastUpdate(new Date());
      })
      .catch(error => console.error('Error refreshing quotas:', error));
  }, []);

  const refreshService = useCallback((serviceId: string) => {
    fetch(`http://localhost:3001/api/quotas/refresh/${serviceId}`, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        // Endpoint returns a single ServiceStatus
        setStatuses(prevStatuses => mergeStatuses(prevStatuses, normalizeStatuses([data as ServiceStatus]), 'partial'));
        setLastUpdate(new Date());
      })
      .catch(error => console.error('Error refreshing service:', error));
  }, []);

  return { statuses, isConnected, lastUpdate, reloadCached, refresh, refreshService };
}
