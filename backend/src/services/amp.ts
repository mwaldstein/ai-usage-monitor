import { BaseAIService } from "./base.ts";
import type { UsageQuota } from "../types/index.ts";
import { randomUUID } from "crypto";
import { Either, Schema as S } from "effect";
import { nowTs } from "../utils/dates.ts";
import { logger } from "../utils/logger.ts";
import { normalizeProviderError } from "./errorNormalization.ts";
import {
  AMPPaidBalanceResult,
  AMPQuotaResultTuple,
  AMPRemoteResultEnvelope,
} from "../schemas/providerResponses.ts";

interface AMPQuotaData {
  bucket: string;
  quota: number;
  hourlyReplenishment: number;
  windowHours: number;
  validProviderModels: string;
  used: number;
}

interface AMPPaidBalanceData {
  credits: number; // Paid credits balance in USD cents (e.g., 1000 = $10.00)
}

export class AMPService extends BaseAIService {
  private parseQuotaResponse(data: unknown): AMPQuotaData | null {
    try {
      // AMP uses SvelteKit remote commands with positional encoding
      // Format: {"type":"result","result":"[\"{\\\"bucket\\\":1,...},\\\"ubi\\\",2000,83,24,\\\"all\\\",0]"}

      const envelope = S.decodeUnknownEither(AMPRemoteResultEnvelope)(data);
      if (Either.isLeft(envelope)) {
        return null;
      }

      const parsedResult: unknown = JSON.parse(envelope.right.result);
      const resultArray = S.decodeUnknownEither(AMPQuotaResultTuple)(parsedResult);
      if (Either.isLeft(resultArray)) {
        return null;
      }

      const [, bucket, quota, hourlyReplenishment, windowHours, validProviderModels, used] =
        resultArray.right;
      return {
        bucket,
        quota,
        hourlyReplenishment,
        windowHours,
        validProviderModels,
        used,
      };
    } catch (error) {
      logger.error({ err: error }, "Error parsing AMP quota response");
      return null;
    }
  }

  private parsePaidBalanceResponse(data: unknown): AMPPaidBalanceData | null {
    try {
      // AMP uses SvelteKit remote commands with positional encoding for paid balance
      // Format: {"type":"result","result":"[2000]"} where value is credits in cents

      const envelope = S.decodeUnknownEither(AMPRemoteResultEnvelope)(data);
      if (Either.isLeft(envelope)) {
        return null;
      }

      const parsedResult: unknown = JSON.parse(envelope.right.result);
      const result = S.decodeUnknownEither(AMPPaidBalanceResult)(parsedResult);
      if (Either.isLeft(result)) {
        return null;
      }

      if (typeof result.right === "number") {
        return { credits: result.right };
      }

      if (result.right.length > 0) {
        return { credits: result.right[0] };
      }

      return null;
    } catch (error) {
      logger.error({ err: error }, "Error parsing AMP paid balance response");
      return null;
    }
  }

  private parseBillingBalance(html: string): number | null {
    try {
      // The balance is displayed in HTML like:
      // <div class="text-5xl leading-[0.9] mt-8 flex flex-wrap items-baseline gap-1.5">
      //   <span class="break-all tracking-tight">1.10</span>
      //   <span class="text-2xl text-muted-foreground font-light leading-none">USD</span>
      // </div>

      // Look for the balance pattern in the billing section
      // The pattern is: <span class="break-all tracking-tight">1.10</span> <span class="text-2xl text-muted-foreground font-light leading-none">USD</span>
      const balanceMatch = html.match(
        /class="break-all[^"]*"[^>]*>([\d.]+)<\/span>\s*<span[^>]*class="[^"]*text-muted-foreground[^"]*"[^>]*>USD<\/span>/i,
      );
      if (balanceMatch) {
        const balance = parseFloat(balanceMatch[1]);
        if (!isNaN(balance)) {
          return balance;
        }
      }

      // Alternative: look for the pattern in the entire HTML
      const altMatch = html.match(
        /<span[^>]*class="break-all[^"]*"[^>]*>([\d.]+)<\/span>\s*<span[^>]*>USD<\/span>/i,
      );
      if (altMatch) {
        const balance = parseFloat(altMatch[1]);
        if (!isNaN(balance)) {
          return balance;
        }
      }

      return null;
    } catch (error) {
      logger.error({ err: error }, "Error parsing billing balance from HTML");
      return null;
    }
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Check if API key (session cookie) is provided
      if (!this.service.apiKey) {
        logger.warn(
          "No session cookie provided for AMP service. Authentication required. Please copy your session cookie from the browser and paste it as the API key.",
        );
        return [];
      }

      const quotas: UsageQuota[] = [];
      const now = nowTs();

      // First, fetch the settings page HTML to get the billing balance
      let billingBalance: number | null = null;
      try {
        const htmlResponse = await this.client.get("/settings", {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Authorization: undefined, // Clear the Authorization header from base client
            Cookie: this.service.apiKey,
          },
        });

        if (htmlResponse.data && typeof htmlResponse.data === "string") {
          billingBalance = this.parseBillingBalance(htmlResponse.data);
        }
      } catch {}

      // AMP uses SvelteKit remote commands
      // Endpoint: /_app/remote/{id}/getFreeTierUsage
      // The ID appears to be static: w6b2h6
      const response = await this.client.get("/_app/remote/w6b2h6/getFreeTierUsage", {
        headers: {
          Accept: "application/json",
          Authorization: undefined, // Clear the Authorization header from base client
          Cookie: this.service.apiKey,
          "x-sveltekit-pathname": "/settings",
        },
      });

      const quotaData = this.parseQuotaResponse(response.data);

      if (!quotaData) {
        logger.warn("Could not parse AMP quota data");
        return [];
      }

      // AMP quota values are in cents/credits - convert to dollars (divide by 100)
      const quotaDollars = quotaData.quota / 100;
      const usedDollars = quotaData.used / 100;
      const remainingDollars = quotaDollars - usedDollars;
      const hourlyReplenishmentDollars = quotaData.hourlyReplenishment / 100;

      // Add the main quota (in dollars)
      // Note: The AMP free tier continuously replenishes at a rate rather than resetting
      const quotaMetric = `${quotaData.bucket}_quota`;
      quotas.push({
        id: randomUUID(),
        serviceId: this.service.id,
        metric: quotaMetric,
        limit: quotaDollars,
        used: usedDollars,
        remaining: remainingDollars > 0 ? remainingDollars : 0,
        resetAt: now + quotaData.windowHours * 60 * 60, // Window for full replenishment
        createdAt: nowTs(),
        updatedAt: nowTs(),
        replenishmentRate: {
          amount: hourlyReplenishmentDollars,
          period: "hour",
        },
        type: "usage", // Burn down style - focus on remaining
      });

      // Add billing balance if found from HTML
      if (billingBalance !== null && billingBalance > 0) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: "billing_balance",
          limit: billingBalance,
          used: 0,
          remaining: billingBalance,
          resetAt: now + 365 * 24 * 60 * 60, // 1 year
          createdAt: nowTs(),
          updatedAt: nowTs(),
          type: "credits", // Credit balance style - focus on remaining
        });
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
        `Error fetching AMP quotas for ${this.service.name}: ${normalizedError.message}`,
      );
      return [];
    }
  }
}
