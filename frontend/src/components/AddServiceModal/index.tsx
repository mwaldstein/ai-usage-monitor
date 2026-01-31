import { useState, useEffect } from "react";
import type { AIService } from "../../types";
import { PROVIDERS, PROVIDER_INSTRUCTIONS } from "./providerConfigs";
import { ProviderSelector } from "./ProviderSelector";
import { InstructionsPanel } from "./InstructionsPanel";
import { ServiceFormFields } from "./ServiceFormFields";
import { X } from "lucide-react";

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Omit<AIService, "id" | "createdAt" | "updatedAt" | "displayOrder">) => void;
  editingService?: AIService | null;
  disabled?: boolean;
}

export function AddServiceModal({
  isOpen,
  onClose,
  onSubmit,
  editingService,
  disabled,
}: AddServiceModalProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showInstructions, setShowInstructions] = useState(true);

  const isEditing = !!editingService;

  useEffect(() => {
    if (editingService) {
      setName(editingService.name);
      setProvider(editingService.provider);
      setApiKey(editingService.apiKey || "");
      setBearerToken(editingService.bearerToken || "");
      setBaseUrl(editingService.baseUrl || "");
    } else {
      setName("");
      setProvider("openai");
      setApiKey("");
      setBearerToken("");
      setBaseUrl("");
    }
    setShowInstructions(true);
  }, [editingService, isOpen]);

  if (!isOpen) return null;

  const instructions = PROVIDER_INSTRUCTIONS[provider];
  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      provider,
      apiKey: apiKey || undefined,
      bearerToken: bearerToken || undefined,
      baseUrl: baseUrl || undefined,
      enabled: true,
    });
    onClose();
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setApiKey("");
    setBearerToken("");
    setBaseUrl("");
    setShowInstructions(true);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-strong rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: selectedProvider?.color || "#71717a" }}
            />
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? "Edit Service" : "Add AI Service"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <ProviderSelector
            provider={provider}
            isEditing={isEditing}
            onProviderChange={handleProviderChange}
          />

          <InstructionsPanel
            instructions={instructions}
            showInstructions={showInstructions}
            onToggle={() => setShowInstructions(!showInstructions)}
          />

          <ServiceFormFields
            name={name}
            apiKey={apiKey}
            bearerToken={bearerToken}
            baseUrl={baseUrl}
            instructions={instructions}
            onNameChange={setName}
            onApiKeyChange={setApiKey}
            onBearerTokenChange={setBearerToken}
            onBaseUrlChange={setBaseUrl}
          />
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-white/10 bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-white/10 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={disabled}
            className={`flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-violet-600/20 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {disabled ? "Offline" : isEditing ? "Save Changes" : "Add Service"}
          </button>
        </div>
      </div>
    </div>
  );
}
