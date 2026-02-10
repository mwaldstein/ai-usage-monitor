import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import axios from "axios";
import { Either, Schema as S } from "effect";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { normalizeProviderError, ProviderServiceError } from "./errorNormalization.ts";
import { CodexUsageResponse } from "../schemas/providerResponses.ts";
import { normalizeBearerToken } from "../utils/jwt.ts";

/**
 * CodexService - Fetches usage limits for OpenAI Codex CLI
 *
 * Note: Codex is a separate product from the OpenAI API. It has its own
 * authentication and rate limits.
 *
 * Authentication methods (in order of preference):
 * 1. Bearer token (service.bearerToken) - JWT token from localStorage
 * 2. Session cookies (service.apiKey) - Cookie string from browser
 *
 * This service fetches from: https://chatgpt.com/backend-api/wham/usage
 */
export class CodexService extends BaseAIService {
  private extractChatGPTAccountId(cookieString: string): string {
    // ChatGPT seems to key multi-account/org context off the `chatgpt-account-id` header.
    // In captured cookies this may appear as `_account=<uuid>` (and sometimes `account_id=<uuid>`).
    const match = cookieString.match(/(?:^|;\s*)(?:account_id|_account)=([^;]+)/);
    return match?.[1]?.trim() || "";
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    const quotas: UsageQuota[] = [];
    const now = nowTs();
    const serviceName = this.service.name;

    try {
      // Check if authentication is provided (bearer token or cookie)
      if (!this.service.bearerToken && !this.service.apiKey) {
        logger.error(
          `[Codex:${serviceName}] ERROR: No authentication provided. Please provide either a Bearer token or session cookie.`,
        );
        return quotas;
      }

      // Create a client for chatgpt.com (different from api.openai.com)
      const chatgptClient = axios.create({
        baseURL: "https://chatgpt.com",
        timeout: 10000,
        headers: {
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://chatgpt.com/codex/settings/usage",
        },
      });

      // Build request headers
      const requestHeaders: Record<string, string> = {};

      // Add Bearer token if provided
      if (this.service.bearerToken) {
        requestHeaders["Authorization"] =
          `Bearer ${normalizeBearerToken(this.service.bearerToken)}`;
      }

      // Add Cookie if provided (for backward compatibility during testing)
      let accountId = "";
      if (this.service.apiKey) {
        requestHeaders["Cookie"] = this.service.apiKey;

        // Extract account ID from the cookie if possible
        accountId = this.extractChatGPTAccountId(this.service.apiKey);
      }

      if (accountId) {
        requestHeaders["chatgpt-account-id"] = accountId;
      }

      // Fetch Codex usage from the ChatGPT backend API
      const response = await chatgptClient.get("/backend-api/wham/usage", {
        headers: requestHeaders,
      });

      const decoded = S.decodeUnknownEither(CodexUsageResponse)(response.data);
      if (Either.isLeft(decoded)) {
        logger.warn({ err: decoded.left }, `[Codex:${serviceName}] Invalid usage response payload`);
        throw new ProviderServiceError("Invalid Codex usage response payload", "INVALID_PAYLOAD");
      }
      const data = decoded.right;

      // Add rolling 5-hour quota (primary_window - 18000 seconds)
      if (data.rate_limit?.primary_window) {
        const window = data.rate_limit.primary_window;
        const usedPercent = window.used_percent;
        const burnDownPercent = 100 - usedPercent;

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "rolling_5hour",
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: window.reset_at,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // Add weekly quota (secondary_window - 604800 seconds / 7 days)
      if (data.rate_limit?.secondary_window) {
        const window = data.rate_limit.secondary_window;
        const usedPercent = window.used_percent;
        const burnDownPercent = 100 - usedPercent;

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "weekly",
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: window.reset_at,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // Add code review quota if available (weekly window)
      if (data.code_review_rate_limit?.primary_window) {
        const window = data.code_review_rate_limit.primary_window;
        const usedPercent = window.used_percent;
        const burnDownPercent = 100 - usedPercent;

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "code_reviews",
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: window.reset_at,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "usage",
        });
      }

      // Add credits info if available
      if (data.credits?.balance !== null && data.credits?.balance !== undefined) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "credits",
          limit: data.credits.balance,
          used: 0,
          remaining: data.credits.balance,
          resetAt: now + 86400 * 365,
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
        `[Codex:${serviceName}] ERROR during fetch: ${normalizedError.message}`,
      );
      throw error;
    }

    return quotas;
  }
}
