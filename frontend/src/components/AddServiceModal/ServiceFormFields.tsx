import type { ProviderInstructions } from "./providerConfigs";

interface ServiceFormFieldsProps {
  name: string;
  apiKey: string;
  bearerToken: string;
  baseUrl: string;
  instructions: ProviderInstructions;
  onNameChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onBearerTokenChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
}

export function ServiceFormFields({
  name,
  apiKey,
  bearerToken,
  baseUrl,
  instructions,
  onNameChange,
  onApiKeyChange,
  onBearerTokenChange,
  onBaseUrlChange,
}: ServiceFormFieldsProps) {
  return (
    <>
      {/* Service Name */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
          Service Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-sm text-white placeholder-zinc-600 transition-all"
          placeholder="e.g., Production OpenAI"
          required
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
          {instructions.apiKeyLabel}
        </label>
        <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.apiKeyHelp}</p>
        <textarea
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all resize-none"
          placeholder={instructions.apiKeyPlaceholder}
          rows={3}
        />
      </div>

      {/* Bearer Token */}
      {instructions.bearerTokenLabel && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            {instructions.bearerTokenLabel}
          </label>
          <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.bearerTokenHelp}</p>
          <textarea
            value={bearerToken}
            onChange={(e) => onBearerTokenChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all resize-none"
            placeholder={instructions.bearerTokenPlaceholder}
            rows={3}
          />
        </div>
      )}

      {/* Base URL */}
      {instructions.showBaseUrl && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
            Base URL
          </label>
          {instructions.baseUrlHelp && (
            <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.baseUrlHelp}</p>
          )}
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all"
            placeholder={instructions.baseUrlPlaceholder || "https://api.example.com/v1"}
          />
        </div>
      )}
    </>
  );
}
