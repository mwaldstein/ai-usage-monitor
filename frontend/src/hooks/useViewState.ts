import { useState, useCallback } from "react";

export type ViewMode = "compact" | "expanded";
export type CurrentView = "dashboard" | "analytics" | "settings";

export function useViewState() {
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>("dashboard");

  const toggleServiceSelection = useCallback((serviceId: string) => {
    setSelectedService((prev) => (prev === serviceId ? null : serviceId));
  }, []);

  return {
    viewMode,
    selectedService,
    currentView,
    setViewMode,
    setCurrentView,
    toggleServiceSelection,
  };
}
