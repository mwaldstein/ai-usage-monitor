import { useState, useEffect } from "react";
import type { AIService } from "../types";

import { getApiBaseUrl } from "../services/backendUrls";

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
      const data = await response.json();
      setServices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const addService = async (
    service: Omit<AIService, "id" | "createdAt" | "updatedAt" | "displayOrder">,
  ) => {
    try {
      const response = await fetch(`${API_URL}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service),
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
      const response = await fetch(`${API_URL}/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service),
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
      const response = await fetch(`${API_URL}/services/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceIds }),
      });
      if (!response.ok) throw new Error("Failed to reorder services");
      const data = await response.json();
      setServices(data);
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
