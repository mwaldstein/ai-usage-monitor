import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useUsageHistory, useVersion } from "./hooks/useApi";
import { useServiceManagement } from "./hooks/useServiceManagement";
import { useViewState } from "./hooks/useViewState";
import { useAuth } from "./hooks/useAuth";
import { ServiceCard } from "./components/ServiceCard";
import { AddServiceModal } from "./components/AddServiceModal";
import { AnalyticsView } from "./components/AnalyticsView";
import { LoginPage } from "./components/LoginPage";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { SettingsView } from "./components/SettingsView";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Settings,
  LayoutGrid,
  List,
  Activity,
  AlertCircle,
  BarChart3,
  LogOut,
  KeyRound,
} from "lucide-react";

function App() {
  const auth = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const {
    statuses,
    isConnected,
    isReconnecting,
    lastUpdate,
    reloadCached,
    refresh,
    refreshService,
  } = useWebSocket();

  const {
    services,
    isModalOpen,
    editingService,
    openModal,
    handleCloseModal,
    handleModalSubmit,
    handleEditService,
    handleDeleteService,
    handleReorderService,
  } = useServiceManagement({ reloadCached });

  const {
    viewMode,
    selectedService,
    currentView,
    setViewMode,
    setCurrentView,
    toggleServiceSelection,
  } = useViewState();

  const { history, refresh: refreshHistory } = useUsageHistory(undefined, 2);
  const { version, commitSha } = useVersion();

  useEffect(() => {
    if (!lastUpdate) return;
    refreshHistory();
  }, [lastUpdate, refreshHistory]);

  const handleRefreshAll = useCallback(() => {
    refresh();
  }, [refresh]);

  // Auth gate: show loading, login, or setup screen when auth is enabled
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (auth.authEnabled && !auth.user) {
    return <LoginPage auth={auth} />;
  }

  const healthyCount = statuses.filter((s) => s.isHealthy).length;
  const totalCount = statuses.length;

  // Calculate aggregate stats
  const aggregateStats = statuses.reduce(
    (acc, status) => {
      status.quotas.forEach((quota) => {
        const percentage = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
        acc.totalQuotas++;
        if (percentage > 90) acc.criticalQuotas++;
        else if (percentage > 70) acc.warningQuotas++;
      });
      return acc;
    },
    { totalQuotas: 0, criticalQuotas: 0, warningQuotas: 0 },
  );

  return (
    <div className="min-h-screen bg-[#0f0f11] text-[#fafafa]">
      {/* Compact Header - Red styling when disconnected */}
      <header
        className={`glass sticky top-0 z-50 border-b transition-colors duration-300 ${
          isConnected ? "border-white/10" : "border-red-500/50 bg-red-950/20"
        }`}
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 pulse-live" : "bg-red-500 animate-pulse"}`}
                />
                <h1
                  className={`text-sm font-semibold tracking-wide ${!isConnected ? "text-red-400" : ""}`}
                >
                  AI Monitor
                </h1>
                {!isConnected && (
                  <span className="hidden sm:flex items-center gap-1 text-xs text-red-400 font-medium">
                    <AlertCircle size={12} />
                    {isReconnecting ? "Reconnecting..." : "Disconnected"}
                  </span>
                )}
              </div>

              {/* Quick Stats */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
                <span className="px-2 py-0.5 rounded-full bg-zinc-800/50 border border-white/5">
                  {healthyCount}/{totalCount} online
                </span>
                {aggregateStats.criticalQuotas > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">
                    {aggregateStats.criticalQuotas} critical
                  </span>
                )}
                {aggregateStats.warningQuotas > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/20">
                    {aggregateStats.warningQuotas} warning
                  </span>
                )}
              </div>
            </div>

            {/* Main Navigation Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentView("dashboard")}
                disabled={!isConnected}
                className={`flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === "dashboard"
                    ? "bg-zinc-800 text-white border border-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                } ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                data-testid="nav-dashboard"
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
              <button
                onClick={() => setCurrentView("analytics")}
                disabled={!isConnected}
                className={`flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === "analytics"
                    ? "bg-zinc-800 text-white border border-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                } ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                data-testid="nav-analytics"
              >
                <BarChart3 size={16} />
                <span className="hidden sm:inline">Analytics</span>
              </button>
              <button
                onClick={() => setCurrentView("settings")}
                disabled={!isConnected}
                className={`flex items-center gap-2 px-2 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === "settings"
                    ? "bg-zinc-800 text-white border border-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                } ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                data-testid="nav-settings"
              >
                <Settings size={16} />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>

            {/* Right: Dashboard controls + Auth */}
            <div className="flex items-center gap-1">
              {currentView === "dashboard" && (
                <>
                  {/* View Toggle */}
                  <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
                    <button
                      onClick={() => setViewMode("compact")}
                      className={`p-1 sm:p-1.5 rounded-md transition-all ${viewMode === "compact" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
                      title="Compact view"
                    >
                      <LayoutGrid size={12} className="sm:size-[14px]" />
                    </button>
                    <button
                      onClick={() => setViewMode("expanded")}
                      className={`p-1 sm:p-1.5 rounded-md transition-all ${viewMode === "expanded" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
                      title="Expanded view"
                    >
                      <List size={12} className="sm:size-[14px]" />
                    </button>
                  </div>

                  <button
                    onClick={handleRefreshAll}
                    disabled={!isConnected}
                    className={`btn-icon tooltip ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                    data-tooltip={isConnected ? "Refresh all" : "Offline - cannot refresh"}
                    data-testid="refresh-all-button"
                  >
                    <RefreshCw size={14} />
                  </button>
                </>
              )}

              {auth.authEnabled && auth.user && (
                <>
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="btn-icon tooltip"
                    data-tooltip={`Change password (${auth.user.username})`}
                    data-testid="change-password-button"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={auth.logout}
                    className="btn-icon tooltip"
                    data-tooltip={`Logout (${auth.user.username})`}
                    data-testid="logout-button"
                  >
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 py-3">
        {/* Disconnection Banner */}
        {!isConnected && (
          <div className="mb-3 glass rounded-xl p-3 border border-red-500/30 bg-red-950/20">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={16} className="animate-pulse" />
              <span className="font-medium">Backend Disconnected</span>
            </div>
            <p className="text-xs text-red-300/70 mt-1">
              Showing last known data. Controls are disabled until reconnection.
              {isReconnecting && " Reconnecting..."}
            </p>
          </div>
        )}

        {currentView === "analytics" ? (
          <AnalyticsView services={services} statuses={statuses} isConnected={isConnected} />
        ) : currentView === "settings" ? (
          <SettingsView
            services={services}
            statuses={statuses}
            isConnected={isConnected}
            onOpenAddServiceModal={openModal}
            onEditService={handleEditService}
            onDeleteService={handleDeleteService}
            onReorderService={handleReorderService}
          />
        ) : (
          <>
            {/* Service Grid */}
            <div
              className={`grid gap-2 ${
                viewMode === "compact"
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "grid-cols-1 lg:grid-cols-2"
              }`}
            >
              {statuses.map((status) => (
                <ServiceCard
                  key={status.service.id}
                  status={status}
                  history={history}
                  viewMode={viewMode}
                  onRefresh={() => refreshService(status.service.id)}
                  isSelected={selectedService === status.service.id}
                  onSelect={() => toggleServiceSelection(status.service.id)}
                  isConnected={isConnected}
                />
              ))}
            </div>

            {/* Empty State */}
            {statuses.length === 0 && (
              <div className="glass rounded-xl p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Activity size={24} className="text-violet-400" />
                </div>
                <p className="text-zinc-400 text-sm mb-3">No services configured</p>
                <button
                  onClick={openModal}
                  disabled={!isConnected}
                  className={`px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Add Your First Service
                </button>
                {!isConnected && (
                  <p className="text-xs text-red-400 mt-2">Connect to backend to add services</p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Connection Status Footer */}
      <footer className="fixed bottom-0 left-0 right-0 glass border-t border-white/10 py-1 px-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi size={12} className="text-emerald-500" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff size={12} className="text-red-500" />
                  <span>Disconnected</span>
                </>
              )}
            </div>
            {version && (
              <span className="text-zinc-600">
                v{version}
                {commitSha && commitSha !== "unknown" && (
                  <span className="text-zinc-700 ml-1">({commitSha})</span>
                )}
              </span>
            )}
          </div>
          {lastUpdate && (
            <span data-testid="last-updated">Updated {lastUpdate.toLocaleTimeString()}</span>
          )}
        </div>
      </footer>

      {/* Modal */}
      <AddServiceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleModalSubmit}
        editingService={editingService}
        disabled={!isConnected}
      />

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSubmit={auth.changePassword}
      />
    </div>
  );
}

export default App;
