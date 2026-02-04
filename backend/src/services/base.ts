import axios from "axios";
import type { AxiosInstance } from "axios";
import type { AIService, UsageQuota, ServiceStatus } from "../types/index.ts";
import { providerConfigs } from "./providers.ts";
import { nowTs } from "../utils/dates.ts";
import { getJWTExpiration } from "../utils/jwt.ts";

export abstract class BaseAIService {
  protected client: AxiosInstance;
  protected service: AIService;

  constructor(service: AIService) {
    this.service = service;
    const config = providerConfigs[service.provider];

    let baseURL = service.baseUrl || config.baseUrl;

    // Some providers (like Codex) don't use the base client - they create their own
    // For those cases, we create a minimal client that won't be used
    this.client = axios.create({
      baseURL: baseURL || "http://localhost",
      timeout: 10000,
      headers: this.buildHeaders(config.headers || {}, service.apiKey || ""),
    });
  }

  private buildHeaders(template: Record<string, string>, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(template)) {
      headers[key] = value.replace("{apiKey}", apiKey);
    }
    return headers;
  }

  abstract fetchQuotas(): Promise<UsageQuota[]>;

  /**
   * Extract JWT expiration from service bearer token or API key
   * Returns expiration timestamp (unix seconds) if found, undefined otherwise
   */
  protected extractTokenExpiration(): number | undefined {
    // Check bearerToken first (most likely to be JWT)
    if (this.service.bearerToken) {
      const exp = getJWTExpiration(this.service.bearerToken);
      if (exp) return exp;
    }

    // Also check apiKey (some providers use JWT as API key)
    if (this.service.apiKey) {
      const exp = getJWTExpiration(this.service.apiKey);
      if (exp) return exp;
    }

    return undefined;
  }

  async getStatus(): Promise<ServiceStatus> {
    // Extract JWT expiration before fetching quotas
    const tokenExpiration = this.extractTokenExpiration();

    try {
      const quotas = await this.fetchQuotas();
      return {
        service: this.service,
        quotas,
        lastUpdated: nowTs(),
        isHealthy: true,
        authError: false,
        tokenExpiration,
      };
    } catch (error) {
      return {
        service: this.service,
        quotas: [],
        lastUpdated: nowTs(),
        isHealthy: false,
        authError: this.isAuthError(error),
        error: error instanceof Error ? error.message : "Unknown error",
        tokenExpiration,
      };
    }
  }

  protected isAuthError(error: any): boolean {
    // Check for common authentication error patterns
    if (error?.response?.status === 401) return true;
    if (error?.response?.status === 403) return true;
    if (error?.response?.status === 429) return true;
    if (error?.code === "UNAUTHORIZED") return true;
    if (error?.code === "INVALID_TOKEN") return true;
    if (error?.code === "TOKEN_EXPIRED") return true;

    // Check for rate limiting that might be auth-related
    if (
      error?.response?.status === 429 &&
      (error?.response?.data?.message?.includes("token") ||
        error?.response?.data?.message?.includes("auth"))
    )
      return true;

    return false;
  }
}
