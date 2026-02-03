import { useState, useCallback } from "react";
import { useServices } from "./useServices";
import type { AIService } from "../types";

interface UseServiceManagementOptions {
  reloadCached: () => void;
}

export function useServiceManagement({ reloadCached }: UseServiceManagementOptions) {
  const {
    services,
    addService,
    updateService,
    deleteService,
    reorderServices,
    refresh: refreshServices,
  } = useServices();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<AIService | null>(null);

  const handleAddService = useCallback(
    async (service: Omit<AIService, "id" | "createdAt" | "updatedAt" | "displayOrder">) => {
      const success = await addService(service);
      if (success) {
        reloadCached();
      }
      return success;
    },
    [addService, reloadCached],
  );

  const handleUpdateService = useCallback(
    async (service: Partial<AIService>) => {
      if (!editingService) return false;
      const success = await updateService(editingService.id, service);
      if (success) {
        setEditingService(null);
        reloadCached();
      }
      return success;
    },
    [editingService, updateService, reloadCached],
  );

  const handleDeleteService = useCallback(
    async (id: string) => {
      if (confirm("Delete this service?")) {
        await deleteService(id);
        refreshServices();
        reloadCached();
      }
    },
    [deleteService, refreshServices, reloadCached],
  );

  const handleEditService = useCallback((service: AIService) => {
    setEditingService(service);
    setIsModalOpen(true);
  }, []);

  const handleReorderService = useCallback(
    async (serviceId: string, direction: "up" | "down") => {
      const currentIndex = services.findIndex((s) => s.id === serviceId);
      if (currentIndex === -1) return;

      const newServices = [...services];
      if (direction === "up" && currentIndex > 0) {
        [newServices[currentIndex], newServices[currentIndex - 1]] = [
          newServices[currentIndex - 1],
          newServices[currentIndex],
        ];
      } else if (direction === "down" && currentIndex < services.length - 1) {
        [newServices[currentIndex], newServices[currentIndex + 1]] = [
          newServices[currentIndex + 1],
          newServices[currentIndex],
        ];
      } else {
        return;
      }

      await reorderServices(newServices.map((s) => s.id));
      reloadCached();
    },
    [services, reorderServices, reloadCached],
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingService(null);
  }, []);

  const handleModalSubmit = useCallback(
    async (service: Omit<AIService, "id" | "createdAt" | "updatedAt" | "displayOrder">) => {
      if (editingService) {
        const updateData: Partial<AIService> = {
          name: service.name,
          provider: service.provider,
          apiKey: service.apiKey,
          bearerToken: service.bearerToken,
          baseUrl: service.baseUrl,
          enabled: service.enabled,
        };
        await handleUpdateService(updateData);
      } else {
        await handleAddService(service);
      }
    },
    [editingService, handleAddService, handleUpdateService],
  );

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  return {
    services,
    isModalOpen,
    editingService,
    openModal,
    handleCloseModal,
    handleModalSubmit,
    handleEditService,
    handleDeleteService,
    handleReorderService,
  };
}
