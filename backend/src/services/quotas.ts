import { Schema as S, Either } from "effect";
import { AIProviderSchema } from "../types/index.ts";
import type { AIProvider, AIService, ServiceStatus, UsageQuota } from "../types/index.ts";
import { getDatabase } from "../database/index.ts";
import { ServiceFactory } from "./factory.ts";
import { logger } from "../utils/logger.ts";
import { nowTs } from "../utils/dates.ts";
import type { ServerMessage as ServerMessageType } from "shared/ws";

let refreshInProgress = false;

export function isRefreshInProgress(): boolean {
  return refreshInProgress;
}

// Parse refresh interval to get minutes (supports simple "every N minutes" format)
export function getRefreshIntervalMinutes(refreshInterval: string): number {
  // Handle cron format like */5 * * * * (every 5 minutes)
  const match = refreshInterval.match(/^\*\/(\d+) \* \* \* \*$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Default to 5 minutes if parsing fails
  return 5;
}

// Save quotas to database
async function saveQuotasToDb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  service: AIService,
  quotas: readonly UsageQuota[],
): Promise<void> {
  const now = nowTs();

  for (const quota of quotas) {
    await db.run(
      `INSERT INTO quotas (id, service_id, metric, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       limit_value = excluded.limit_value,
       used_value = excluded.used_value,
       remaining_value = excluded.remaining_value,
       type = excluded.type,
       replenishment_amount = excluded.replenishment_amount,
       replenishment_period = excluded.replenishment_period,
       reset_at = excluded.reset_at,
       updated_at = ?`,
      [
        quota.id,
        quota.serviceId,
        quota.metric,
        quota.limit,
        quota.used,
        quota.remaining,
        quota.type || null,
        quota.replenishmentRate?.amount ?? null,
        quota.replenishmentRate?.period ?? null,
        quota.resetAt,
        now,
        now,
        now,
      ],
    );
  }

  // Log usage history
  for (const quota of quotas) {
    await db.run(
      "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
      [quota.serviceId, quota.metric, now, quota.used],
    );
  }
}

// Refresh a single service with timeout protection
async function refreshService(service: AIService): Promise<ServiceStatus> {
  try {
    // Wrap in timeout to prevent one slow service from blocking others
    const status = await Promise.race([
      ServiceFactory.getServiceStatus(service),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Service refresh timeout")), 15000),
      ),
    ]);

    return status;
  } catch (error) {
    logger.error({ err: error, service: service.name }, "Error refreshing quotas for service");
    return {
      service,
      quotas: [],
      lastUpdated: nowTs(),
      isHealthy: false,
      authError: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Map database row to AIService
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

function mapServiceRow(row: Record<string, unknown>): AIService | null {
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

// Refresh quotas periodically
export async function refreshQuotas(
  broadcast: (data: ServerMessageType) => void,
  refreshInterval: string,
): Promise<void> {
  if (refreshInProgress) {
    logger.info("Refresh already in progress; skipping this run");
    return;
  }

  refreshInProgress = true;
  try {
    logger.info("Refreshing quotas...");
    const db = getDatabase();
    const rows = await db.all("SELECT * FROM services WHERE enabled = 1");

    // Map database columns to TypeScript properties
    const services: AIService[] = rows
      .map(mapServiceRow)
      .filter((service): service is AIService => service !== null);

    const results: ServiceStatus[] = [];
    const intervalMinutes = getRefreshIntervalMinutes(refreshInterval);
    const staggerDelayMs =
      services.length > 1 ? (intervalMinutes * 60 * 1000) / services.length : 0;

    for (let i = 0; i < services.length; i++) {
      const service = services[i];

      // Stagger refreshes evenly across the refresh window
      if (i > 0 && staggerDelayMs > 0) {
        logger.info(
          { service: service.name, waitSeconds: Math.round(staggerDelayMs / 1000) },
          "Staggering service refresh",
        );
        await new Promise((resolve) => setTimeout(resolve, staggerDelayMs));
      }

      const status = await refreshService(service);
      results.push(status);

      // Only update database if service returned quotas successfully
      if (status.quotas && status.quotas.length > 0) {
        try {
          await saveQuotasToDb(db, service, status.quotas);
        } catch (dbError) {
          logger.error(
            { err: dbError, service: service.name },
            "Database error while saving quotas",
          );
          // Don't let database errors break the entire refresh
        }
      }
    }

    // Broadcast to all clients
    broadcast({
      type: "status",
      data: results,
      ts: nowTs(),
    });

    logger.info("Quotas refreshed successfully");
  } catch (error) {
    logger.error({ err: error }, "Error refreshing quotas");
  } finally {
    refreshInProgress = false;
  }
}
