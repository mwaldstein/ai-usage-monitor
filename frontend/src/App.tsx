import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useServices, useUsageHistory } from './hooks/useApi';
import { ServiceCard } from './components/ServiceCard';
import { AddServiceModal } from './components/AddServiceModal';
import { AnalyticsView } from './components/AnalyticsView';
import {
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  Settings,
  Trash2,
  Edit2,
  LayoutGrid,
  List,
  ChevronUp,
  Activity,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { AIService } from './types';

function App() {
  const { statuses, isConnected, isReconnecting, lastUpdate, reloadCached, refresh, refreshService } = useWebSocket();
  const { services, addService, updateService, deleteService, reorderServices, refresh: refreshServices } = useServices();
  const { history, refresh: refreshHistory } = useUsageHistory(undefined, 2); // Fetch 2 hours of history for comparisons
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingService, setEditingService] = useState<AIService | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'expanded'>('compact');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'analytics'>('dashboard');

  // Keep history in sync with live updates.
  useEffect(() => {
    if (!lastUpdate) return;
    refreshHistory();
  }, [lastUpdate, refreshHistory]);

  const handleRefreshAll = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleAddService = async (service: Omit<AIService, 'id' | 'createdAt' | 'updatedAt' | 'displayOrder'>) => {
    const success = await addService(service);
    if (success) {
      reloadCached();
    }
  };

  const handleUpdateService = async (service: Partial<AIService>) => {
    if (!editingService) return;
    const success = await updateService(editingService.id, service);
    if (success) {
      setEditingService(null);
      reloadCached();
    }
  };

  const handleDeleteService = async (id: string) => {
    if (confirm('Delete this service?')) {
      await deleteService(id);
      refreshServices();
      reloadCached();
    }
  };

  const handleEditService = (service: AIService) => {
    setEditingService(service);
    setIsModalOpen(true);
  };

  const handleReorderService = async (serviceId: string, direction: 'up' | 'down') => {
    const currentIndex = services.findIndex(s => s.id === serviceId);
    if (currentIndex === -1) return;

    let newServices = [...services];
    if (direction === 'up' && currentIndex > 0) {
      [newServices[currentIndex], newServices[currentIndex - 1]] = [newServices[currentIndex - 1], newServices[currentIndex]];
    } else if (direction === 'down' && currentIndex < services.length - 1) {
      [newServices[currentIndex], newServices[currentIndex + 1]] = [newServices[currentIndex + 1], newServices[currentIndex]];
    } else {
      return; // Can't move in this direction
    }

    // Update backend and then refresh the display immediately
    await reorderServices(newServices.map(s => s.id));
    reloadCached(); // Force immediate refresh of WebSocket statuses
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingService(null);
  };

  const handleModalSubmit = async (service: Omit<AIService, 'id' | 'createdAt' | 'updatedAt' | 'displayOrder'>) => {
    if (editingService) {
      // For editing, convert to Partial<AIService> by including all fields from the form
      const updateData: Partial<AIService> = {
        name: service.name,
        provider: service.provider,
        apiKey: service.apiKey,
        bearerToken: service.bearerToken,
        baseUrl: service.baseUrl,
        enabled: service.enabled
      };
      await handleUpdateService(updateData);
    } else {
      await handleAddService(service);
    }
  };

  const healthyCount = statuses.filter(s => s.isHealthy).length;
  const totalCount = statuses.length;

  // Calculate aggregate stats
  const aggregateStats = statuses.reduce((acc, status) => {
    status.quotas.forEach(quota => {
      const percentage = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
      acc.totalQuotas++;
      if (percentage > 90) acc.criticalQuotas++;
      else if (percentage > 70) acc.warningQuotas++;
    });
    return acc;
  }, { totalQuotas: 0, criticalQuotas: 0, warningQuotas: 0 });

  return (
    <div className="min-h-screen bg-[#0f0f11] text-[#fafafa]">
      {/* Compact Header - Red styling when disconnected */}
      <header className={`glass sticky top-0 z-50 border-b transition-colors duration-300 ${
        isConnected ? 'border-white/10' : 'border-red-500/50 bg-red-950/20'
      }`}>
        <div className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 pulse-live' : 'bg-red-500 animate-pulse'}`} />
                <h1 className={`text-sm font-semibold tracking-wide ${!isConnected ? 'text-red-400' : ''}`}>AI Monitor</h1>
                {!isConnected && (
                  <span className="hidden sm:flex items-center gap-1 text-xs text-red-400 font-medium">
                    <AlertCircle size={12} />
                    {isReconnecting ? 'Reconnecting...' : 'Disconnected'}
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

            <div className="flex items-center gap-1">
              {currentView === 'dashboard' && (
                <>
                  {/* View Toggle - Dashboard only */}
                  <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-white/5">
                    <button
                      onClick={() => setViewMode('compact')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'compact' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                      title="Compact view"
                    >
                      <LayoutGrid size={14} />
                    </button>
                    <button
                      onClick={() => setViewMode('expanded')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'expanded' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                      title="Expanded view"
                    >
                      <List size={14} />
                    </button>
                  </div>

                  <button
                    onClick={handleRefreshAll}
                    disabled={!isConnected}
                    className={`btn-icon tooltip ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                    data-tooltip={isConnected ? "Refresh all" : "Offline - cannot refresh"}
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={!isConnected}
                    className={`btn-icon tooltip bg-violet-600 border-violet-500 hover:bg-violet-500 ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                    data-tooltip={isConnected ? "Add service" : "Offline - cannot add services"}
                  >
                    <Plus size={14} />
                  </button>

                  <button
                    onClick={() => isConnected && setShowSettings(!showSettings)}
                    disabled={!isConnected}
                    className={`btn-icon tooltip ${showSettings && isConnected ? 'bg-zinc-700 text-white' : ''} ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                    data-tooltip={isConnected ? "Settings" : "Offline - settings unavailable"}
                  >
                    <Settings size={14} />
                  </button>
                </>
              )}
            </div>

            {/* Main Navigation Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentView('dashboard')}
                disabled={!isConnected}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === 'dashboard'
                    ? 'bg-zinc-800 text-white border border-white/10'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                } ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <LayoutGrid size={16} />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => setCurrentView('analytics')}
                disabled={!isConnected}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === 'analytics'
                    ? 'bg-zinc-800 text-white border border-white/10'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                } ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <BarChart3 size={16} />
                <span>Analytics</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 py-3">
        {/* Settings Panel - Only on Dashboard */}
        {showSettings && isConnected && currentView === 'dashboard' && (
          <div className="mb-3 glass rounded-xl p-3 slide-in">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Services</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-zinc-500 hover:text-white"
              >
                <ChevronUp size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/30 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      statuses.find(s => s.service.id === service.id)?.isHealthy ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm font-medium">{service.name}</span>
                    <span className="text-xs text-zinc-500">{service.provider}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleReorderService(service.id, 'up')}
                      disabled={services.indexOf(service) === 0}
                      className="p-1.5 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => handleReorderService(service.id, 'down')}
                      disabled={services.indexOf(service) === services.length - 1}
                      className="p-1.5 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => handleEditService(service)}
                      className="p-1.5 text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-md transition-colors"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disconnection Banner */}
        {!isConnected && (
          <div className="mb-3 glass rounded-xl p-3 border border-red-500/30 bg-red-950/20">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={16} className="animate-pulse" />
              <span className="font-medium">Backend Disconnected</span>
            </div>
            <p className="text-xs text-red-300/70 mt-1">
              Showing last known data. Controls are disabled until reconnection.{isReconnecting && ' Reconnecting...'}
            </p>
          </div>
        )}

        {currentView === 'analytics' ? (
          <AnalyticsView
            services={services}
            statuses={statuses}
            isConnected={isConnected}
          />
        ) : (
          <>
            {/* Service Grid */}
            <div className={`grid gap-2 ${
              viewMode === 'compact'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1 lg:grid-cols-2'
            }`}>
              {statuses.map((status) => (
                <ServiceCard
                  key={status.service.id}
                  status={status}
                  history={history}
                  viewMode={viewMode}
                  onRefresh={() => refreshService(status.service.id)}
                  isSelected={selectedService === status.service.id}
                  onSelect={() => setSelectedService(
                    selectedService === status.service.id ? null : status.service.id
                  )}
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
                  onClick={() => setIsModalOpen(true)}
                  disabled={!isConnected}
                  className={`px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
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
          {lastUpdate && (
            <span>Updated {lastUpdate.toLocaleTimeString()}</span>
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
    </div>
  );
}

export default App;
