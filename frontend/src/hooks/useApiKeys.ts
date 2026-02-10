import { useCallback, useEffect, useState } from "react";
import { Schema as S, Either } from "effect";
import { CreateApiKeyRequest, CreateApiKeyResponse, ListApiKeysResponse } from "shared/api";
import type { ApiKeyInfo, CreateApiKeyResponse as CreateApiKeyResponseType } from "shared/api";
import { getApiBaseUrl } from "../services/backendUrls";
import { authFetch } from "../services/authFetch";
import { getApiErrorMessage } from "../services/apiErrors";

const API_URL = getApiBaseUrl();

export function useApiKeys(enabled: boolean) {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponseType | null>(null);

  const fetchApiKeys = useCallback(async () => {
    if (!enabled) {
      setApiKeys([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/auth/api-keys`);
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to fetch API keys"));
      }

      const data: unknown = await response.json();
      const decoded = S.decodeUnknownEither(ListApiKeysResponse)(data);
      if (Either.isLeft(decoded)) {
        throw new Error("Invalid API keys response");
      }

      setApiKeys(Array.from(decoded.right, (entry) => ({ ...entry })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const createApiKey = useCallback(
    async (name: string) => {
      if (!enabled) {
        return false;
      }

      try {
        setIsCreating(true);
        const body = S.encodeSync(CreateApiKeyRequest)({ name });
        const response = await authFetch(`${API_URL}/auth/api-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to create API key"));
        }

        const data: unknown = await response.json();
        const decoded = S.decodeUnknownEither(CreateApiKeyResponse)(data);
        if (Either.isLeft(decoded)) {
          throw new Error("Invalid API key create response");
        }

        setCreatedKey(decoded.right);
        await fetchApiKeys();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [enabled, fetchApiKeys],
  );

  const deleteApiKey = useCallback(
    async (id: string) => {
      if (!enabled) {
        return false;
      }

      try {
        setDeletingId(id);
        const response = await authFetch(`${API_URL}/auth/api-keys/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to delete API key"));
        }

        await fetchApiKeys();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [enabled, fetchApiKeys],
  );

  const clearCreatedKey = useCallback(() => {
    setCreatedKey(null);
  }, []);

  useEffect(() => {
    void fetchApiKeys();
  }, [fetchApiKeys]);

  return {
    apiKeys,
    loading,
    error,
    isCreating,
    deletingId,
    createdKey,
    createApiKey,
    deleteApiKey,
    clearCreatedKey,
    refresh: fetchApiKeys,
  };
}
