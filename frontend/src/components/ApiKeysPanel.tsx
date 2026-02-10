import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import type { CreateApiKeyResponse as CreateApiKeyResponseType } from "shared/api";
import { useApiKeys } from "../hooks/useApi";

interface ApiKeysPanelProps {
  enabled: boolean;
}

function formatTs(ts: number | null): string {
  if (ts === null) {
    return "Never";
  }
  return new Date(ts * 1000).toLocaleString();
}

function CreatedKeyNotice({
  createdKey,
  onDismiss,
}: {
  createdKey: CreateApiKeyResponseType;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-300">
          Save this key now - it will not be shown again.
        </p>
        <button
          onClick={onDismiss}
          className="text-xs text-zinc-300 hover:text-white transition-colors"
          type="button"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-2 rounded-md bg-zinc-950/80 border border-white/10 p-2 text-xs font-mono break-all text-zinc-200">
        {createdKey.key}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => void handleCopy()}
          type="button"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs transition-colors"
        >
          <Copy size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-xs text-zinc-400">Prefix: {createdKey.keyPrefix}</span>
      </div>
    </div>
  );
}

export function ApiKeysPanel({ enabled }: ApiKeysPanelProps) {
  const [name, setName] = useState("CLI key");
  const {
    apiKeys,
    loading,
    error,
    isCreating,
    deletingId,
    createdKey,
    createApiKey,
    deleteApiKey,
    clearCreatedKey,
    refresh,
  } = useApiKeys(enabled);

  const disableCreate = useMemo(() => {
    return !enabled || isCreating || name.trim().length === 0;
  }, [enabled, isCreating, name]);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await createApiKey(name.trim());
    if (ok) {
      setName("CLI key");
    }
  };

  const onDelete = async (id: string, label: string) => {
    const confirmed = window.confirm(`Delete API key "${label}"?`);
    if (!confirmed) {
      return;
    }
    await deleteApiKey(id);
  };

  return (
    <section className="mt-4 border-t border-white/10 pt-3" data-testid="api-keys-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-zinc-500" />
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">API Keys</h3>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={!enabled || loading}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Refresh API keys"
          type="button"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Use API keys for CLI access without sharing your password.
      </p>

      <form onSubmit={(event) => void onCreate(event)} className="mt-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!enabled || isCreating}
          className="flex-1 min-w-0 rounded-md border border-white/10 bg-zinc-900/70 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 disabled:opacity-40"
          placeholder="Key name"
          maxLength={64}
          data-testid="api-key-name-input"
        />
        <button
          type="submit"
          disabled={disableCreate}
          className="px-2.5 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="api-key-create-button"
        >
          {isCreating ? "Creating..." : "Create"}
        </button>
      </form>

      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}

      {createdKey && <CreatedKeyNotice createdKey={createdKey} onDismiss={clearCreatedKey} />}

      <div className="mt-3 rounded-lg bg-zinc-900/50 border border-white/5 overflow-hidden">
        {apiKeys.length === 0 ? (
          <div className="p-3 text-xs text-zinc-500">
            {enabled ? "No API keys created yet." : "Connect to create API keys."}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between gap-2 p-2.5"
                data-testid={`api-key-row-${key.id}`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{key.name}</div>
                  <div className="text-xs text-zinc-500 font-mono">{key.keyPrefix}</div>
                  <div className="text-xs text-zinc-500">Created {formatTs(key.createdAt)}</div>
                  <div className="text-xs text-zinc-500">Last used {formatTs(key.lastUsedAt)}</div>
                </div>
                <button
                  onClick={() => void onDelete(key.id, key.name)}
                  disabled={!enabled || deletingId === key.id}
                  className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Delete API key"
                  type="button"
                  data-testid={`api-key-delete-${key.id}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
