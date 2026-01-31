import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import { nowTs, dateToTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";

/**
 * OpenAIService - Fetches billing and usage data from OpenAI API
 *
 * This service uses the standard OpenAI API endpoints:
 * - /dashboard/billing/usage - Monthly usage data
 * - /dashboard/billing/subscription - Account limits and subscription info
 *
 * Note: For OpenAI Codex CLI usage limits, use CodexService instead.
 */
export class OpenAIService extends BaseAIService {
  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [usageResponse, subscriptionResponse] = await Promise.all([
        this.client
          .get("/dashboard/billing/usage", {
            params: {
              start_date: startOfMonth.toISOString().split("T")[0],
              end_date: now.toISOString().split("T")[0],
            },
          })
          .catch(() => null),
        this.client.get("/dashboard/billing/subscription").catch(() => null),
      ]);

      const quotas: UsageQuota[] = [];

      if (subscriptionResponse?.data) {
        const sub = subscriptionResponse.data;

        // Hard limit quota
        if (sub.hard_limit_usd) {
          quotas.push({
            id: randomUUID(),
            serviceId: this.service.id,
            metric: "monthly_spend_limit",
            limit: sub.hard_limit_usd,
            used: usageResponse?.data?.total_usage / 100 || 0,
            remaining: sub.hard_limit_usd - (usageResponse?.data?.total_usage / 100 || 0),
            resetAt: dateToTs(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
            createdAt: nowTs(),
            updatedAt: nowTs(),
          });
        }

        // Soft limit quota
        if (sub.soft_limit_usd) {
          quotas.push({
            id: randomUUID(),
            serviceId: this.service.id,
            metric: "monthly_spend_soft_limit",
            limit: sub.soft_limit_usd,
            used: usageResponse?.data?.total_usage / 100 || 0,
            remaining: sub.soft_limit_usd - (usageResponse?.data?.total_usage / 100 || 0),
            resetAt: dateToTs(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
            createdAt: nowTs(),
            updatedAt: nowTs(),
          });
        }
      }

      return quotas;
    } catch (error) {
      logger.error({ err: error }, `Error fetching OpenAI quotas for ${this.service.name}`);
      throw error;
    }
  }
}

export class GoogleAIService extends BaseAIService {
  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Google AI Studio / Gemini API
      await this.client.get("/models").catch(() => null);

      // Google AI quotas are typically managed through Google Cloud Console
      // For now, return a placeholder that can be updated manually
      const quotas: UsageQuota[] = [];

      // Common Gemini API quotas
      const commonQuotas = [
        { metric: "requests_per_minute", limit: 60 },
        { metric: "tokens_per_minute", limit: 1000000 },
        { metric: "requests_per_day", limit: 1500 },
      ];

      for (const q of commonQuotas) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: q.metric,
          limit: q.limit,
          used: 0,
          remaining: q.limit,
          resetAt: nowTs() + 60, // Reset in 1 minute
          createdAt: nowTs(),
          updatedAt: nowTs(),
        });
      }

      return quotas;
    } catch (error) {
      logger.error({ err: error }, `Error fetching Google AI quotas for ${this.service.name}`);
      throw error;
    }
  }
}

export class AnthropicService extends BaseAIService {
  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Anthropic API - check rate limits from headers
      const response = await this.client.get("/models");

      const quotas: UsageQuota[] = [];
      const headers = response.headers;

      // Extract rate limit info from headers if available
      const rateLimits = {
        requests: {
          limit: parseInt(headers["anthropic-ratelimit-requests-limit"] || "0"),
          remaining: parseInt(headers["anthropic-ratelimit-requests-remaining"] || "0"),
          reset: parseInt(headers["anthropic-ratelimit-requests-reset"] || "0"),
        },
        tokens: {
          limit: parseInt(headers["anthropic-ratelimit-tokens-limit"] || "0"),
          remaining: parseInt(headers["anthropic-ratelimit-tokens-remaining"] || "0"),
          reset: parseInt(headers["anthropic-ratelimit-tokens-reset"] || "0"),
        },
      };

      if (rateLimits.requests.limit > 0) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "requests_per_minute",
          limit: rateLimits.requests.limit,
          used: rateLimits.requests.limit - rateLimits.requests.remaining,
          remaining: rateLimits.requests.remaining,
          resetAt: rateLimits.requests.reset,
          createdAt: nowTs(),
          updatedAt: nowTs(),
        });
      }

      if (rateLimits.tokens.limit > 0) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "tokens_per_minute",
          limit: rateLimits.tokens.limit,
          used: rateLimits.tokens.limit - rateLimits.tokens.remaining,
          remaining: rateLimits.tokens.remaining,
          resetAt: rateLimits.tokens.reset,
          createdAt: nowTs(),
          updatedAt: nowTs(),
        });
      }

      return quotas;
    } catch (error) {
      logger.error({ err: error }, `Error fetching Anthropic quotas for ${this.service.name}`);
      throw error;
    }
  }
}

export class GenericAIService extends BaseAIService {
  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Generic implementation for opencode, amp, z.ai
      // Try to fetch from common endpoints
      const quotas: UsageQuota[] = [];

      // Attempt to get usage from /usage endpoint
      const response = await this.client.get("/usage").catch(() => null);

      if (response?.data) {
        const data = response.data;

        // Handle different response formats
        if (data.quotas) {
          for (const quota of data.quotas) {
            quotas.push({
              id: randomUUID(),
              serviceId: this.service.id,
              metric: quota.metric || quota.name || "unknown",
              limit: quota.limit || quota.total || 0,
              used: quota.used || quota.consumed || 0,
              remaining: quota.remaining || quota.limit - quota.used || 0,
              resetAt: quota.reset_at ? dateToTs(new Date(quota.reset_at)) : nowTs() + 86400,
              createdAt: nowTs(),
              updatedAt: nowTs(),
            });
          }
        }
      }

      return quotas;
    } catch (error) {
      logger.error({ err: error }, `Error fetching quotas for ${this.service.name}`);
      return []; // Return empty for generic services that may not have quota endpoints
    }
  }
}
