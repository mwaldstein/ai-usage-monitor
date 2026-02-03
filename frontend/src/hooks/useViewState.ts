import { useState, useCallback } from "react";

export type ViewMode = "compact" | "expanded";
export type CurrentView = "dashboard" | "analytics";

export function useViewState() {
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>("dashboard");

  const toggleSettings = useCallback((isConnected: boolean) => {
    if (isConnected) {
      setShowSettings((prev) => !prev);
    }
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const toggleServiceSelection = useCallback((serviceId: string) => {
    setSelectedService((prev) => (prev === serviceId ? null : serviceId));
  }, []);

  return {
    showSettings,
    viewMode,
    selectedService,
    currentView,
    setViewMode,
    setCurrentView,
    toggleSettings,
    closeSettings,
    toggleServiceSelection,
  };
}
