import { useState, useEffect } from "react";
import { Schema as S, Either } from "effect";
import type { AIService } from "../types";

import { getApiBaseUrl } from "../services/backendUrls";
import { authFetch } from "../services/authFetch";
import {
  CreateServiceRequest,
  ListServicesResponse,
  ReorderServicesRequest,
  ReorderServicesResponse,
  UpdateServiceRequest,
} from "shared/api";

const API_URL = getApiBaseUrl();

function getProviderHelpUrl(provider: AIService["provider"]): string {
  switch (provider) {
    case "zai":
      return "https://z.ai";
    case "opencode":
      return "https://opencode.ai";
    case "amp":
      return "https://ampcode.com";
    case "openai":
      return "https://platform.openai.com/api-keys";
    case "anthropic":
      return "https://console.anthropic.com/settings/keys";
    case "codex":
      return "https://chatgpt.com";
    default:
      return "";
  }
}

export function useServices() {
  const [services, setServices] = useState<AIService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/services`);
      if (!response.ok) throw new Error("Failed to fetch services");
      const data: unknown = await response.json();
      const decoded = S.decodeUnknownEither(ListServicesResponse)(data);
      if (Either.isLeft(decoded)) {
        throw new Error("Invalid services response");
      }
      const nextServices = Array.from(decoded.right, (service) => ({ ...service }));
      setServices(nextServices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const addService = async (service: CreateServiceRequest) => {
    try {
      const payload = S.encodeSync(CreateServiceRequest)(service);
      const response = await authFetch(`${API_URL}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to add service");
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  };

  const updateService = async (id: string, service: Partial<AIService>) => {
    try {
      const payload = {
        ...(service.name !== undefined ? { name: service.name } : {}),
        ...(service.apiKey !== undefined ? { apiKey: service.apiKey } : {}),
        ...(service.bearerToken !== undefined ? { bearerToken: service.bearerToken } : {}),
        ...(service.baseUrl !== undefined ? { baseUrl: service.baseUrl } : {}),
        ...(service.enabled !== undefined ? { enabled: service.enabled } : {}),
        ...(service.displayOrder !== undefined ? { displayOrder: service.displayOrder } : {}),
      };

      const body = S.encodeSync(UpdateServiceRequest)(payload);
      const response = await authFetch(`${API_URL}/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to update service");
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  };

  const deleteService = async (id: string) => {
    try {
      const response = await authFetch(`${API_URL}/services/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete service");
      await fetchServices();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  };

  const reauthenticateService = async (id: string) => {
    const service = services.find((candidate) => candidate.id === id);
    if (!service) return;

    const helpUrl = getProviderHelpUrl(service.provider);
    if (helpUrl) {
      window.open(helpUrl, "_blank");
    }
  };

  const reorderServices = async (serviceIds: string[]) => {
    try {
      const body = S.encodeSync(ReorderServicesRequest)({ serviceIds });
      const response = await authFetch(`${API_URL}/services/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to reorder services");
      const data: unknown = await response.json();
      const decoded = S.decodeUnknownEither(ReorderServicesResponse)(data);
      if (Either.isLeft(decoded)) {
        throw new Error("Invalid reorder response");
      }
      const nextServices = Array.from(decoded.right, (service) => ({ ...service }));
      setServices(nextServices);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return false;
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return {
    services,
    loading,
    error,
    addService,
    updateService,
    deleteService,
    reauthenticateService,
    reorderServices,
    refresh: fetchServices,
  };
}
