import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import axios, { isAxiosError } from "axios";
import { Either, Schema as S } from "effect";
import { nowTs, dateToTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { normalizeProviderError, ProviderServiceError } from "./errorNormalization.ts";
import { ClaudeUsageResponse } from "../schemas/providerResponses.ts";
import { getDatabase } from "../database/index.ts";

const OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/** Convert a nullable ISO date string to a unix timestamp. Returns 0 when null (no reset scheduled). */
function resetsAtToTs(resetsAt: string | null): number {
  return resetsAt !== null ? dateToTs(new Date(resetsAt)) : 0;
}

/**
 * ClaudeService - Fetches usage limits for Claude.ai via the Anthropic OAuth API.
 *
 * Authentication:
 * - Access token  (service.apiKey)      — OAuth token starting with sk-ant-oat01-
 * - Refresh token (service.bearerToken) — OAuth token starting with sk-ant-ort01-
 *
 * The access token expires after ~8 hours. When a 401 is received the refresh
 * token is used to obtain a new pair of tokens, which are then persisted back to
 * the database so subsequent poll cycles work without user intervention.
 *
 * Endpoint: GET https://api.anthropic.com/api/oauth/usage
 * Required header: anthropic-beta: oauth-2025-04-20
 */
export class ClaudeService extends BaseAIService {
  private async refreshAccessToken(): Promise<string | null> {
    const refreshToken = this.service.bearerToken;
    if (!refreshToken) return null;

    const serviceName = this.service.name;
    try {
      const response = await axios.post(
        OAUTH_TOKEN_URL,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: OAUTH_CLIENT_ID,
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        },
      );

      const newAccessToken: string | undefined = response.data?.access_token;
      const newRefreshToken: string | undefined = response.data?.refresh_token;

      if (!newAccessToken) {
        logger.warn(`[Claude:${serviceName}] Token refresh response missing access_token`);
        return null;
      }

      logger.info(`[Claude:${serviceName}] Access token refreshed successfully`);

      // Update in-memory service so the retry in fetchQuotas() uses the new token
      this.service = { ...this.service, apiKey: newAccessToken };
      if (newRefreshToken) {
        this.service = { ...this.service, bearerToken: newRefreshToken };
      }

      // Persist to database so subsequent poll cycles start with a valid token
      try {
        const db = getDatabase();
        const updatedAt = nowTs();
        if (newRefreshToken) {
          await db.run(
            "UPDATE services SET api_key = ?, bearer_token = ?, updated_at = ? WHERE id = ?",
            [newAccessToken, newRefreshToken, updatedAt, this.service.id],
          );
        } else {
          await db.run("UPDATE services SET api_key = ?, updated_at = ? WHERE id = ?", [
            newAccessToken,
            updatedAt,
            this.service.id,
          ]);
        }
      } catch (dbError) {
        // Non-fatal: the in-memory token is still updated for this cycle
        logger.warn(
          { err: dbError },
          `[Claude:${serviceName}] Failed to persist refreshed token to database`,
        );
      }

      return newAccessToken;
    } catch (error) {
      logger.error({ err: error }, `[Claude:${serviceName}] Token refresh request failed`);
      return null;
    }
  }

  private async fetchUsageData(accessToken: string): Promise<unknown> {
    const response = await axios.get(OAUTH_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.0.37",
        Accept: "application/json",
      },
      timeout: 10000,
    });
    return response.data;
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    const quotas: UsageQuota[] = [];
    const now = nowTs();
    const serviceName = this.service.name;

    try {
      if (!this.service.apiKey) {
        logger.error(
          `[Claude:${serviceName}] ERROR: No access token provided. Add your OAuth access token (sk-ant-oat01-...).`,
        );
        return quotas;
      }

      if (!this.service.bearerToken) {
        logger.error(
          `[Claude:${serviceName}] ERROR: No refresh token provided. Add your OAuth refresh token (sk-ant-ort01-...).`,
        );
        return quotas;
      }

      let responseData: unknown;
      try {
        responseData = await this.fetchUsageData(this.service.apiKey);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          logger.info(`[Claude:${serviceName}] Access token expired, attempting refresh...`);
          const newToken = await this.refreshAccessToken();
          if (!newToken) {
            throw new ProviderServiceError(
              "OAuth access token expired and refresh failed. Please update your tokens.",
              "AUTH_ERROR",
            );
          }
          responseData = await this.fetchUsageData(newToken);
        } else {
          throw error;
        }
      }

      const decoded = S.decodeUnknownEither(ClaudeUsageResponse)(responseData);
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
        const usedPercent = data.five_hour.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "rolling_5hour",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.five_hour.resets_at),
          createdAt: now,
          updatedAt: now,
          type: "usage",
        });
      }

      // 7-day rolling window
      if (data.seven_day) {
        const usedPercent = data.seven_day.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.seven_day.resets_at),
          createdAt: now,
          updatedAt: now,
          type: "usage",
        });
      }

      // 7-day OAuth apps window
      if (data.seven_day_oauth_apps) {
        const usedPercent = data.seven_day_oauth_apps.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_oauth_apps",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.seven_day_oauth_apps.resets_at),
          createdAt: now,
          updatedAt: now,
          type: "usage",
        });
      }

      // 7-day Opus window
      if (data.seven_day_opus) {
        const usedPercent = data.seven_day_opus.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_opus",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.seven_day_opus.resets_at),
          createdAt: now,
          updatedAt: now,
          type: "usage",
        });
      }

      // 7-day Sonnet window
      if (data.seven_day_sonnet) {
        const usedPercent = data.seven_day_sonnet.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_sonnet",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.seven_day_sonnet.resets_at),
          createdAt: now,
          updatedAt: now,
          type: "usage",
        });
      }

      // 7-day Cowork window
      if (data.seven_day_cowork) {
        const usedPercent = data.seven_day_cowork.utilization;
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly_cowork",
          limit: 100,
          used: usedPercent,
          remaining: 100 - usedPercent,
          resetAt: resetsAtToTs(data.seven_day_cowork.resets_at),
          createdAt: now,
          updatedAt: now,
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
          createdAt: now,
          updatedAt: now,
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
