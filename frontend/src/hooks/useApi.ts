import { useState, useEffect, useCallback } from 'react';
import { AIService, UsageHistory, UsageAnalytics, ProviderAnalytics } from '../types';

import { getApiBaseUrl, getVersionUrl } from '../services/backendUrls';

const API_URL = getApiBaseUrl();

export function useServices() {
  const [services, setServices] = useState<AIService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/services`);
      if (!response.ok) throw new Error('Failed to fetch services');
      const data = await response.json();
      setServices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const addService = async (service: Omit<AIService, 'id' | 'createdAt' | 'updatedAt' | 'displayOrder'>) => {
    try {
      const response = await fetch(`${API_URL}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service)
      });
      if (!response.ok) throw new Error('Failed to add service');
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  const updateService = async (id: string, service: Partial<AIService>) => {
    try {
      const response = await fetch(`${API_URL}/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service)
      });
      if (!response.ok) throw new Error('Failed to update service');
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  const deleteService = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/services/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete service');
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  const reauthenticateService = async (id: string) => {
    // Get service details to determine authentication method
    const response = await fetch(`${API_URL}/services/${id}`);
    if (!response.ok) return;
    
    const service = await response.json();
    let helpUrl = '';
    
    switch (service.provider) {
      case 'zai':
        helpUrl = 'https://z.ai';
        break;
      case 'opencode':
        helpUrl = 'https://opencode.ai';
        break;
      case 'amp':
        helpUrl = 'https://ampcode.com';
        break;
      case 'openai':
      case 'anthropic':
      case 'google':
        helpUrl = 'https://platform.openai.com/api-keys';
        break;
      default:
        helpUrl = '';
    }
    
    if (helpUrl) {
      window.open(helpUrl, '_blank');
    }
  };

  const reorderServices = async (serviceIds: string[]) => {
    try {
      const response = await fetch(`${API_URL}/services/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds })
      });
      if (!response.ok) throw new Error('Failed to reorder services');
      const data = await response.json();
      setServices(data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return { services, loading, error, addService, updateService, deleteService, reauthenticateService, reorderServices, refresh: fetchServices };
}

export function useUsageHistory(serviceId?: string, hours: number = 24) {
  const [history, setHistory] = useState<UsageHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (serviceId) params.append('serviceId', serviceId);
      params.append('hours', hours.toString());
      
      const response = await fetch(`${API_URL}/usage/history?${params}`);
      if (!response.ok) throw new Error('Failed to fetch usage history');
      const data = await response.json();
      setHistory(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [serviceId, hours]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}

export function useUsageAnalytics(serviceId?: string, days: number = 30, interval: string = '1h', groupBy?: string) {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (serviceId) params.append('serviceId', serviceId);
      params.append('days', days.toString());
      params.append('interval', interval);
      if (groupBy) params.append('groupBy', groupBy);
      
      console.log(`[Analytics] Fetching with days=${days}, interval=${interval}, groupBy=${groupBy}`);
      
      const response = await fetch(`${API_URL}/usage/analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch usage analytics');
      const data = await response.json();
      console.log(`[Analytics] Received ${data.timeSeries?.length || 0} time series points`);
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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
      params.append('days', days.toString());
      
      const response = await fetch(`${API_URL}/usage/providers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch provider analytics');
      const data = await response.json();
      setProviderAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchProviderAnalytics();
  }, [fetchProviderAnalytics]);

  return { providerAnalytics, loading, error, refresh: fetchProviderAnalytics };
}

export function useVersion() {
  const [version, setVersion] = useState<string>('');
  const [commitSha, setCommitSha] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(getVersionUrl());
        if (!response.ok) throw new Error('Failed to fetch version');
        const data = await response.json();
        setVersion(data.version);
        setCommitSha(data.commitSha);
      } catch (err) {
        console.error('Error fetching version:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, commitSha, loading };
}
