import * as Effect from "effect/Effect";
import type { getDatabase } from "../../database/index.ts";
import { runInTransaction } from "../../database/index.ts";
import type { AIService, UsageQuota } from "../../types/index.ts";
import { nowTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";

export async function saveQuotasToDb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  service: AIService,
  quotas: readonly UsageQuota[],
): Promise<void> {
  const now = nowTs();
  const persistedQuotas: UsageQuota[] = [];

  await runInTransaction(db, (txDb) =>
    Effect.gen(function* () {
      for (const quota of quotas) {
        if (
          !Number.isFinite(quota.limit) ||
          !Number.isFinite(quota.used) ||
          !Number.isFinite(quota.remaining) ||
          !Number.isFinite(quota.resetAt)
        ) {
          logger.warn(
            {
              service: service.name,
              serviceId: quota.serviceId,
              metric: quota.metric,
              limit: quota.limit,
              used: quota.used,
              remaining: quota.remaining,
              resetAt: quota.resetAt,
            },
            "Skipping quota with non-finite numeric values",
          );
          continue;
        }

        persistedQuotas.push(quota);

        yield* txDb.run(
          `INSERT INTO quotas (id, service_id, metric, raw_limit_value, raw_used_value, raw_remaining_value, limit_value, used_value, remaining_value, type, replenishment_amount, replenishment_period, reset_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
           raw_limit_value = excluded.raw_limit_value,
           raw_used_value = excluded.raw_used_value,
           raw_remaining_value = excluded.raw_remaining_value,
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

      for (const quota of persistedQuotas) {
        yield* txDb.run(
          "INSERT OR REPLACE INTO usage_history (service_id, metric, ts, value) VALUES (?, ?, ?, ?)",
          [quota.serviceId, quota.metric, now, quota.used],
        );
      }
    }),
  );
}
