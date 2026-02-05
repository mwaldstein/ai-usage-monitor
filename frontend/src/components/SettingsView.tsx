import { ArrowDown, ArrowUp, Edit2, Plus, Trash2 } from "lucide-react";
import { LogViewer } from "./LogViewer";
import type { AIService, ServiceStatus } from "../types";

interface SettingsViewProps {
  services: AIService[];
  statuses: ServiceStatus[];
  isConnected: boolean;
  onOpenAddServiceModal: () => void;
  onEditService: (service: AIService) => void;
  onDeleteService: (serviceId: string) => void;
  onReorderService: (serviceId: string, direction: "up" | "down") => void;
}

export function SettingsView({
  services,
  statuses,
  isConnected,
  onOpenAddServiceModal,
  onEditService,
  onDeleteService,
  onReorderService,
}: SettingsViewProps) {
  return (
    <div className="glass rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-white">Service Settings</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage service order, tokens, and provider configuration.
          </p>
        </div>
        <button
          onClick={onOpenAddServiceModal}
          disabled={!isConnected}
          className={`flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors ${!isConnected ? "opacity-40 cursor-not-allowed" : ""}`}
          data-testid="add-service-button"
        >
          <Plus size={14} />
          Add Service
        </button>
      </div>

      <div className="space-y-2">
        {services.map((service, index) => (
          <div
            key={service.id}
            className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/30 border border-white/5 hover:border-white/10 transition-colors"
            data-testid={`settings-service-row-${service.id}`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  statuses.find((s) => s.service.id === service.id)?.isHealthy
                    ? "bg-emerald-500"
                    : "bg-red-500"
                }`}
              />
              <span
                className="text-sm font-medium"
                data-testid={`settings-service-name-${service.id}`}
              >
                {service.name}
              </span>
              <span className="text-xs text-zinc-500">{service.provider}</span>
              {(() => {
                const tokenExp = statuses.find((s) => s.service.id === service.id)?.tokenExpiration;
                if (!tokenExp) return null;
                const now = Date.now() / 1000;
                const hoursLeft = (tokenExp - now) / 3600;
                if (hoursLeft <= 0) {
                  return <span className="text-xs text-red-400 font-medium">Token expired</span>;
                }
                if (hoursLeft <= 24) {
                  return (
                    <span className="text-xs text-amber-400">Exp {Math.ceil(hoursLeft)}h</span>
                  );
                }
                return (
                  <span className="text-xs text-zinc-500">
                    Exp {new Date(tokenExp * 1000).toLocaleDateString()}
                  </span>
                );
              })()}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => onReorderService(service.id, "up")}
                disabled={index === 0 || !isConnected}
                className="p-1.5 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid={`settings-reorder-up-${service.id}`}
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={() => onReorderService(service.id, "down")}
                disabled={index === services.length - 1 || !isConnected}
                className="p-1.5 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid={`settings-reorder-down-${service.id}`}
              >
                <ArrowDown size={12} />
              </button>
              <button
                onClick={() => onEditService(service)}
                disabled={!isConnected}
                className="p-1.5 text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => onDeleteService(service.id)}
                disabled={!isConnected}
                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {services.length === 0 && (
        <p className="text-xs text-zinc-500 mt-4">No services configured yet.</p>
      )}

      <div className="mt-4">
        <LogViewer enabled={isConnected} />
      </div>
    </div>
  );
}
