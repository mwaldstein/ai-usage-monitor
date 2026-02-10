import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import { Either, Schema as S } from "effect";
import { nowTs, dateToTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { normalizeProviderError, ProviderServiceError } from "./errorNormalization.ts";
import { ZAIQuotaResponse, ZAISubscriptionResponse } from "../schemas/providerResponses.ts";

export class ZAIService extends BaseAIService {
  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Check if API key (Bearer token) is provided
      if (!this.service.apiKey) {
        logger.warn(
          "No API token provided for z.ai service. Please provide your Bearer token from localStorage (z-ai-open-platform-token-production or z-ai-website-token).",
        );
        return [];
      }

      const quotas: UsageQuota[] = [];
      const now = nowTs();

      // Fetch quota limits
      const quotaResponse = await this.client.get("/api/monitor/usage/quota/limit", {
        headers: {
          Authorization: `Bearer ${this.service.apiKey}`,
          Accept: "application/json",
        },
      });

      const decodedQuota = S.decodeUnknownEither(ZAIQuotaResponse)(quotaResponse.data);
      if (Either.isLeft(decodedQuota)) {
        logger.warn({ err: decodedQuota.left }, "Invalid z.ai quota response payload");
        throw new ProviderServiceError("Invalid z.ai quota response payload", "INVALID_PAYLOAD");
      }
      const quotaData = decodedQuota.right;

      if (quotaData.code === 200 && quotaData.data.limits.length > 0) {
        for (const limit of quotaData.data.limits) {
          const quotaId = randomUUID();

          // Create a descriptive metric name based on type
          let metricName = limit.type.toLowerCase();
          if (limit.type === "TIME_LIMIT") {
            metricName = `requests_per_${limit.unit}min_window`;
          } else if (limit.type === "TOKENS_LIMIT") {
            metricName = "tokens_consumption";
          }

          const quota: UsageQuota = {
            id: quotaId,
            serviceId: this.service.id,
            metric: metricName,
            limit: limit.usage,
            used: limit.currentValue,
            remaining: limit.remaining,
            resetAt: limit.nextResetTime
              ? Math.floor(limit.nextResetTime / 1000)
              : now + 24 * 60 * 60,
            createdAt: nowTs(),
            updatedAt: nowTs(),
            type: "usage",
          };

          if (metricName === "tokens_consumption") {
            quotas.unshift(quota);
          } else {
            quotas.push(quota);
          }

          // Add usage details for each model if available
          if (limit.usageDetails && limit.usageDetails.length > 0) {
            for (const detail of limit.usageDetails) {
              const modelMetric = `${detail.modelCode}_usage`;
              quotas.push({
                id: randomUUID(),
                serviceId: this.service.id,
                metric: modelMetric,
                limit: 0, // No specific limit per model
                used: detail.usage,
                remaining: 0,
                resetAt: limit.nextResetTime
                  ? Math.floor(limit.nextResetTime / 1000)
                  : now + 24 * 60 * 60,
                createdAt: nowTs(),
                updatedAt: nowTs(),
                type: "usage",
              });
            }
          }
        }
      }

      // Fetch subscription info
      try {
        const subscriptionResponse = await this.client.get("/api/biz/subscription/list", {
          headers: {
            Authorization: `Bearer ${this.service.apiKey}`,
            Accept: "application/json",
          },
        });

        const decodedSubscription = S.decodeUnknownEither(ZAISubscriptionResponse)(
          subscriptionResponse.data,
        );
        if (Either.isLeft(decodedSubscription)) {
          logger.warn(
            { err: decodedSubscription.left },
            "Invalid z.ai subscription response payload",
          );
          return quotas;
        }
        const subscriptionData = decodedSubscription.right;

        if (subscriptionData.code === 200) {
          for (const sub of subscriptionData.data) {
            quotas.push({
              id: randomUUID(),
              serviceId: this.service.id,
              metric: `subscription_${sub.productId}`,
              limit: 1,
              used: sub.status === "VALID" ? 0 : 1,
              remaining: sub.status === "VALID" ? 1 : 0,
              resetAt: dateToTs(new Date(sub.valid.split("-")[1].trim())),
              createdAt: nowTs(),
              updatedAt: nowTs(),
            });
          }
        }
      } catch (subError) {
        logger.warn({ err: subError }, "Could not fetch z.ai subscription info");
      }

      return quotas;
    } catch (error) {
      const normalizedError = normalizeProviderError(error);
      logger.error(
        {
          err: error,
          errorKind: normalizedError.kind,
          status: normalizedError.status,
          providerCode: normalizedError.providerCode,
        },
        `Error fetching z.ai quotas for ${this.service.name}: ${normalizedError.message}`,
      );
      throw error;
    }
  }
}
