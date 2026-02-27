import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import axios from "axios";
import { Either, Schema as S } from "effect";
import { nowTs, dateToTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { normalizeProviderError, ProviderServiceError } from "./errorNormalization.ts";
import { ClaudeUsageResponse } from "../schemas/providerResponses.ts";

/**
 * ClaudeService - Fetches usage limits for Claude.ai web interface
 *
 * This is separate from the Anthropic API service. Claude.ai has its own
 * session-based authentication and usage tracking for the web/chat product.
 *
 * Authentication:
 * - Session cookie (service.apiKey) - Cookie string from browser (must include `sessionKey`)
 * - The `lastActiveOrg` cookie provides the organization UUID for team accounts
 *
 * Endpoint: GET https://claude.ai/api/organizations/{orgId}/usage
 */
export class ClaudeService extends BaseAIService {
  private extractOrgId(cookieString: string): string {
    const match = cookieString.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    return match?.[1]?.trim() || "";
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    const quotas: UsageQuota[] = [];
    const now = nowTs();
    const serviceName = this.service.name;

    try {
      if (!this.service.apiKey) {
        logger.error(
          `[Claude:${serviceName}] ERROR: No session cookie provided. Please provide your claude.ai session cookie.`,
        );
        return quotas;
      }

      const orgId = this.extractOrgId(this.service.apiKey);
      if (!orgId) {
        logger.error(
          `[Claude:${serviceName}] ERROR: Could not extract organization ID from cookies. Ensure the 'lastActiveOrg' cookie is included.`,
        );
        return quotas;
      }

      const claudeClient = axios.create({
        baseURL: "https://claude.ai",
        timeout: 10000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Referer: "https://claude.ai/settings/usage",
          Cookie: this.service.apiKey,
        },
      });

      const response = await claudeClient.get(`/api/organizations/${orgId}/usage`);

      const decoded = S.decodeUnknownEither(ClaudeUsageResponse)(response.data);
      if (Either.isLeft(decoded)) {
        logger.warn(
          { err: decoded.left },
          `[Claude:${serviceName}] Invalid usage response payload`,
        );
        throw new ProviderServiceError("Invalid Claude usage response payload", "INVALID_PAYLOAD");
      }
      const data = decoded.right;

      // 5-hour rolling window
      if (data.five_hour) {
        const usedPercent = data.five_hour.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "rolling_5hour",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.five_hour.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // 7-day rolling window
      if (data.seven_day) {
        const usedPercent = data.seven_day.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.seven_day.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // 7-day OAuth apps window
      if (data.seven_day_oauth_apps) {
        const usedPercent = data.seven_day_oauth_apps.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_oauth_apps",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.seven_day_oauth_apps.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // 7-day Opus window
      if (data.seven_day_opus) {
        const usedPercent = data.seven_day_opus.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_opus",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.seven_day_opus.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // 7-day Sonnet window
      if (data.seven_day_sonnet) {
        const usedPercent = data.seven_day_sonnet.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_sonnet",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.seven_day_sonnet.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // 7-day Cowork window
      if (data.seven_day_cowork) {
        const usedPercent = data.seven_day_cowork.utilization * 100;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_cowork",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: dateToTs(new Date(data.seven_day_cowork.resets_at)),
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // Extra usage (pay-per-use overage)
      if (data.extra_usage?.is_enabled && data.extra_usage.monthly_limit != null) {
        const monthlyLimit = data.extra_usage.monthly_limit;
        const usedCredits = data.extra_usage.used_credits ?? 0;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "extra_usage",
          limit: monthlyLimit,
          used: usedCredits,
          remaining: monthlyLimit - usedCredits,
          resetAt: now + 30 * 24 * 60 * 60,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "credits",
        });
      }
    } catch (error) {
      const normalizedError = normalizeProviderError(error);
      logger.error(
        {
          err: error,
          errorKind: normalizedError.kind,
          status: normalizedError.status,
          providerCode: normalizedError.providerCode,
        },
        `[Claude:${serviceName}] ERROR during fetch: ${normalizedError.message}`,
      );
      throw error;
    }

    return quotas;
  }
}
