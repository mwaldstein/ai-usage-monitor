import { useState, useEffect } from "react";
import { Schema as S, Either } from "effect";
import type { AIService } from "../types";

import { getApiBaseUrl } from "../services/backendUrls";
import {
  CreateServiceRequest,
  ListServicesResponse,
  ReorderServicesRequest,
  ReorderServicesResponse,
  UpdateServiceRequest,
} from "shared/api";

const API_URL = getApiBaseUrl();

export function useServices() {
  const [services, setServices] = useState<AIService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/services`);
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
      const response = await fetch(`${API_URL}/services`, {
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
      const response = await fetch(`${API_URL}/services/${id}`, {
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
      const response = await fetch(`${API_URL}/services/${id}`, {
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
    const response = await fetch(`${API_URL}/services/${id}`);
    if (!response.ok) return;

    const service = await response.json();
    let helpUrl = "";

    switch (service.provider) {
      case "zai":
        helpUrl = "https://z.ai";
        break;
      case "opencode":
        helpUrl = "https://opencode.ai";
        break;
      case "amp":
        helpUrl = "https://ampcode.com";
        break;
      case "openai":
      case "anthropic":
      case "google":
        helpUrl = "https://platform.openai.com/api-keys";
        break;
      default:
        helpUrl = "";
    }

    if (helpUrl) {
      window.open(helpUrl, "_blank");
    }
  };

  const reorderServices = async (serviceIds: string[]) => {
    try {
      const body = S.encodeSync(ReorderServicesRequest)({ serviceIds });
      const response = await fetch(`${API_URL}/services/reorder`, {
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
