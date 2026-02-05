import { BaseAIService } from "../base.ts";
import type { UsageQuota, AIService } from "../../types/index.ts";
import { randomUUID } from "crypto";
import { nowTs, dateToTs } from "../../utils/dates.ts";
import { logger } from "../../utils/logger.ts";
import {
  parseHydrationData,
  type OpenCodeBillingData,
  type OpenCodeRollingUsage,
  type OpenCodeWeeklyUsage,
} from "./hydrationParser.ts";

export class OpenCodeService extends BaseAIService {
  private workspaceId: string | null = null;
  private baseDomain: string = "https://opencode.ai";

  constructor(service: AIService) {
    let workspaceId: string | null = null;
    let baseDomain = "https://opencode.ai";

    if (service.baseUrl) {
      const match = service.baseUrl.match(/workspace\/(wrk_[a-zA-Z0-9]+)/);
      if (match) {
        workspaceId = match[1];
      }

      const urlMatch = service.baseUrl.match(/^(https?:\/\/[^/]+)/);
      if (urlMatch) {
        baseDomain = urlMatch[1];
      }
    }

    const modifiedService = {
      ...service,
      baseUrl: baseDomain,
    };

    super(modifiedService);
    this.workspaceId = workspaceId;
    this.baseDomain = baseDomain;
  }

  private extractWorkspaceId(): string | null {
    return this.workspaceId;
  }

  private buildBurnDownQuota(
    metric: string,
    usage: OpenCodeRollingUsage | OpenCodeWeeklyUsage,
    now: number,
  ): UsageQuota {
    const pagePercent = usage.usagePercent;
    const usedPercent = 100 - pagePercent;

    return {
      id: randomUUID(),
      serviceId: this.service.id,
      metric,
      limit: 100,
      used: usedPercent,
      remaining: pagePercent,
      resetAt: now + usage.resetInSec,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      type: "usage",
    };
  }

  private buildMonthlyQuota(billing: OpenCodeBillingData): UsageQuota | null {
    if (billing.monthlyUsage === undefined || billing.monthlyLimit === null) {
      return null;
    }

    const nowDate = new Date();
    return {
      id: randomUUID(),
      serviceId: this.service.id,
      metric: "monthly_usage",
      limit: billing.monthlyLimit,
      used: billing.monthlyUsage,
      remaining: billing.monthlyLimit - billing.monthlyUsage,
      resetAt: dateToTs(new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1)),
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }

  private buildBalanceQuota(balance: number, now: number): UsageQuota {
    const balanceDollars = balance / 1e8;

    return {
      id: randomUUID(),
      serviceId: this.service.id,
      metric: "account_balance",
      limit: balanceDollars,
      used: 0,
      remaining: balanceDollars,
      resetAt: now + 86400 * 365,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      type: "credits",
    };
  }

  private buildSubscriptionPlanQuota(plan: string, _now: number): UsageQuota {
    const nowDate = new Date();
    const planValue = parseInt(plan) || 0;

    return {
      id: randomUUID(),
      serviceId: this.service.id,
      metric: "subscription_plan",
      limit: planValue,
      used: 0,
      remaining: planValue,
      resetAt: dateToTs(new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1)),
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
  }

  private detectAuthPage(html: string): boolean {
    return (
      html.includes("<title>OpenAuth</title>") ||
      html.includes("window.location.href = ") ||
      html.includes('"auth":') ||
      (html.includes("login") && html.includes("password"))
    );
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      const workspaceId = this.extractWorkspaceId();
      if (!workspaceId) {
        logger.warn(
          "No workspace ID found for opencode service. Set baseUrl to include workspace ID (e.g., https://opencode.ai/workspace/WRK_ID)",
        );
        return [];
      }

      if (!this.service.apiKey) {
        logger.warn(
          "No session cookie provided for opencode service. Authentication required. Please copy your session cookie from the browser and paste it as the API key.",
        );
        return [];
      }

      const response = await this.client.get(`/workspace/${workspaceId}/billing`, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Cookie: this.service.apiKey,
        },
      });

      const html = response.data;

      if (!html || typeof html !== "string" || html.length === 0) {
        logger.error(`Empty or invalid HTML response for ${this.service.name}`);
        throw new Error("Invalid response: empty HTML");
      }

      const data = parseHydrationData(html);

      const hasAnyData = data.billing || data.subscription || data.rollingUsage || data.weeklyUsage;
      if (!hasAnyData) {
        if (this.detectAuthPage(html)) {
          logger.error(`Authentication required for ${this.service.name} - received login page`);
          const error = new Error(
            "Authentication failed: Session cookie expired or invalid. Please get a new session cookie from your browser.",
          );
          (error as Error & { code: string }).code = "UNAUTHORIZED";
          throw error;
        } else {
          logger.error(`No billing or subscription data found in HTML for ${this.service.name}`);
          throw new Error("No quota data found in response.");
        }
      }

      const quotas: UsageQuota[] = [];
      const now = nowTs();

      const rollingUsage = data.rollingUsage || data.subscription?.rollingUsage;
      if (rollingUsage) {
        quotas.push(this.buildBurnDownQuota("rolling_5hour_usage", rollingUsage, now));
      }

      const weeklyUsage = data.weeklyUsage || data.subscription?.weeklyUsage;
      if (weeklyUsage) {
        quotas.push(this.buildBurnDownQuota("weekly_usage", weeklyUsage, now));
      }

      const monthlyQuota = data.billing ? this.buildMonthlyQuota(data.billing) : null;
      if (monthlyQuota) {
        quotas.push(monthlyQuota);
      }

      if (data.billing?.balance !== undefined) {
        quotas.push(this.buildBalanceQuota(data.billing.balance, now));
      }

      if (data.billing?.subscription?.plan) {
        quotas.push(this.buildSubscriptionPlanQuota(data.billing.subscription.plan, now));
      }

      return quotas;
    } catch (error) {
      logger.error({ err: error }, `Error fetching opencode quotas for ${this.service.name}`);
      return [];
    }
  }
}
