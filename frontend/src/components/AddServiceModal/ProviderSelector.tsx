import { PROVIDERS } from "./providerConfigs";

interface ProviderSelectorProps {
  provider: string;
  isEditing: boolean;
  onProviderChange: (provider: string) => void;
}

export function ProviderSelector({ provider, isEditing, onProviderChange }: ProviderSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
        Provider
      </label>
      <div className="grid grid-cols-4 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => !isEditing && onProviderChange(p.value)}
            disabled={isEditing}
            className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
              provider === p.value
                ? "bg-zinc-700 text-white border border-white/20"
                : "bg-zinc-800/50 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-zinc-300"
            } ${isEditing ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="truncate">{p.label}</span>
            </div>
          </button>
        ))}
      </div>
      {isEditing && (
        <p className="text-[10px] text-zinc-500 mt-1.5">Provider cannot be changed when editing</p>
      )}
    </div>
  );
}
