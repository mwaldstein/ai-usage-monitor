import { Schema as S, Either } from "effect";
import { AIProviderSchema } from "../../types/index.ts";
import type { AIProvider, AIService } from "../../types/index.ts";
import { logger } from "../../utils/logger.ts";

function parseRequiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseProvider(value: unknown): AIProvider | null {
  const decoded = S.decodeUnknownEither(AIProviderSchema)(value);
  if (Either.isLeft(decoded)) {
    return null;
  }
  return decoded.right;
}

export function mapServiceRow(row: Record<string, unknown>): AIService | null {
  const id = parseRequiredString(row.id);
  const name = parseRequiredString(row.name);
  const provider = parseProvider(row.provider);

  if (!id || !name || !provider) {
    logger.warn(
      { serviceId: row.id, provider: row.provider },
      "Skipping service with invalid data",
    );
    return null;
  }

  return {
    id,
    name,
    provider,
    apiKey: parseOptionalString(row.api_key),
    bearerToken: parseOptionalString(row.bearer_token),
    baseUrl: parseOptionalString(row.base_url),
    enabled: row.enabled === 1 || row.enabled === true,
    displayOrder: parseNumber(row.display_order, 0),
    createdAt: parseNumber(row.created_at, 0),
    updatedAt: parseNumber(row.updated_at, 0),
  };
}
