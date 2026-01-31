import { BaseAIService } from './base.js'
import { UsageQuota, AIService } from '../types/index.js'
import { randomUUID } from 'crypto'
import axios from 'axios'

// Interfaces for Codex usage data from the API response
interface CodexWindow {
  used_percent: number
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
}

interface CodexRateLimit {
  allowed: boolean
  limit_reached: boolean
  primary_window: CodexWindow
  secondary_window: CodexWindow
}

interface CodexUsageResponse {
  plan_type: string
  rate_limit: CodexRateLimit
  code_review_rate_limit: {
    allowed: boolean
    limit_reached: boolean
    primary_window: CodexWindow
    secondary_window: CodexWindow | null
  }
  credits: {
    has_credits: boolean
    unlimited: boolean
    balance: number | null
    approx_local_messages: number | null
    approx_cloud_messages: number | null
  }
}

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
  constructor(service: AIService) {
    super(service)
  }

  private extractChatGPTAccountId(cookieString: string): string {
    // ChatGPT seems to key multi-account/org context off the `chatgpt-account-id` header.
    // In captured cookies this may appear as `_account=<uuid>` (and sometimes `account_id=<uuid>`).
    const match = cookieString.match(/(?:^|;\s*)(?:account_id|_account)=([^;]+)/)
    return match?.[1]?.trim() || ''
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    const quotas: UsageQuota[] = []
    const now = new Date()
    const serviceName = this.service.name

    try {
      // Check if authentication is provided (bearer token or cookie)
      if (!this.service.bearerToken && !this.service.apiKey) {
        console.error(
          `[Codex:${serviceName}] ERROR: No authentication provided. Please provide either a Bearer token or session cookie.`,
        )
        return quotas
      }

      console.log(`[Codex:${serviceName}] Starting fetch...`)

      if (this.service.bearerToken) {
        console.log(
          `[Codex:${serviceName}] Using Bearer token auth (${this.service.bearerToken.length} chars)`,
        )
      }

      if (this.service.apiKey) {
        console.log(
          `[Codex:${serviceName}] Using Cookie auth (${this.service.apiKey.length} chars)`,
        )
      }

      // Create a client for chatgpt.com (different from api.openai.com)
      const chatgptClient = axios.create({
        baseURL: 'https://chatgpt.com',
        timeout: 10000,
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Referer: 'https://chatgpt.com/codex/settings/usage',
        },
      })

      // Build request headers
      const requestHeaders: Record<string, string> = {}

      // Add Bearer token if provided
      if (this.service.bearerToken) {
        requestHeaders['Authorization'] = `Bearer ${this.service.bearerToken}`
      }

      // Add Cookie if provided (for backward compatibility during testing)
      let accountId = ''
      if (this.service.apiKey) {
        requestHeaders['Cookie'] = this.service.apiKey

        // Extract account ID from the cookie if possible
        accountId = this.extractChatGPTAccountId(this.service.apiKey)
        if (accountId) {
          console.log(`[Codex:${serviceName}] Found account in cookie: ${accountId}`)
        } else {
          console.log(
            `[Codex:${serviceName}] WARNING: No account identifier found in cookie (_account/account_id)`,
          )
        }
      }

      if (accountId) {
        requestHeaders['chatgpt-account-id'] = accountId
      }

      // Fetch Codex usage from the ChatGPT backend API
      console.log(`[Codex:${serviceName}] Sending request to /backend-api/wham/usage...`)
      console.log(
        `[Codex:${serviceName}] Request auth: bearer=${!!this.service.bearerToken} cookie=${!!this.service.apiKey}`,
      )
      const response = await chatgptClient.get('/backend-api/wham/usage', {
        headers: requestHeaders,
      })

      console.log(`[Codex:${serviceName}] Response status: ${response.status}`)
      console.log(
        `[Codex:${serviceName}] Response data keys: ${Object.keys(response.data).join(', ')}`,
      )

      const data: CodexUsageResponse = response.data

      // Log the full response structure for debugging
      console.log(`[Codex:${serviceName}] Plan type: ${data.plan_type || 'NOT FOUND'}`)

      if (data.rate_limit) {
        console.log(`[Codex:${serviceName}] Rate limit allowed: ${data.rate_limit.allowed}`)
        console.log(`[Codex:${serviceName}] Rate limit reached: ${data.rate_limit.limit_reached}`)
      } else {
        console.log(`[Codex:${serviceName}] WARNING: No rate_limit data in response`)
      }

      // Add rolling 5-hour quota (primary_window - 18000 seconds)
      if (data.rate_limit?.primary_window) {
        const window = data.rate_limit.primary_window
        const usedPercent = window.used_percent
        const burnDownPercent = 100 - usedPercent

        console.log(`[Codex:${serviceName}] Primary window (5-hour):`)
        console.log(`  - used_percent: ${usedPercent}%`)
        console.log(`  - limit_window_seconds: ${window.limit_window_seconds}`)
        console.log(`  - reset_after_seconds: ${window.reset_after_seconds}`)
        console.log(`  - reset_at: ${new Date(window.reset_at * 1000).toISOString()}`)

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'rolling_5hour',
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: new Date(window.reset_at * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'usage',
        })
        console.log(
          `[Codex:${serviceName}] ✓ Added rolling_5hour quota: ${burnDownPercent.toFixed(1)}% remaining`,
        )
      } else {
        console.log(`[Codex:${serviceName}] ✗ No primary_window (5-hour) data found`)
      }

      // Add weekly quota (secondary_window - 604800 seconds / 7 days)
      if (data.rate_limit?.secondary_window) {
        const window = data.rate_limit.secondary_window
        const usedPercent = window.used_percent
        const burnDownPercent = 100 - usedPercent

        console.log(`[Codex:${serviceName}] Secondary window (weekly):`)
        console.log(`  - used_percent: ${usedPercent}%`)
        console.log(`  - limit_window_seconds: ${window.limit_window_seconds}`)
        console.log(`  - reset_after_seconds: ${window.reset_after_seconds}`)
        console.log(`  - reset_at: ${new Date(window.reset_at * 1000).toISOString()}`)

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'weekly',
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: new Date(window.reset_at * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'usage',
        })
        console.log(
          `[Codex:${serviceName}] ✓ Added weekly quota: ${burnDownPercent.toFixed(1)}% remaining`,
        )
      } else {
        console.log(`[Codex:${serviceName}] ✗ No secondary_window (weekly) data found`)
      }

      // Add code review quota if available (weekly window)
      if (data.code_review_rate_limit?.primary_window) {
        const window = data.code_review_rate_limit.primary_window
        const usedPercent = window.used_percent
        const burnDownPercent = 100 - usedPercent

        console.log(`[Codex:${serviceName}] Code review window:`)
        console.log(`  - used_percent: ${usedPercent}%`)
        console.log(`  - allowed: ${data.code_review_rate_limit.allowed}`)

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'code_reviews',
          limit: 100,
          used: usedPercent,
          remaining: burnDownPercent,
          resetAt: new Date(window.reset_at * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'usage',
        })
        console.log(
          `[Codex:${serviceName}] ✓ Added code_reviews quota: ${burnDownPercent.toFixed(1)}% remaining`,
        )
      } else {
        console.log(`[Codex:${serviceName}] ✗ No code_review_rate_limit data found`)
      }

      // Add credits info if available
      if (data.credits?.balance !== null && data.credits?.balance !== undefined) {
        console.log(
          `[Codex:${serviceName}] Credits: ${data.credits.balance} (has_credits: ${data.credits.has_credits}, unlimited: ${data.credits.unlimited})`,
        )

        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'credits',
          limit: data.credits.balance,
          used: 0,
          remaining: data.credits.balance,
          resetAt: new Date(now.getTime() + 86400000 * 365),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'credits',
        })
        console.log(`[Codex:${serviceName}] ✓ Added credits quota: ${data.credits.balance}`)
      } else {
        console.log(`[Codex:${serviceName}] ✗ No credits data found`)
      }

      console.log(`[Codex:${serviceName}] Fetch complete. Total quotas: ${quotas.length}`)
    } catch (error: any) {
      console.error(`[Codex:${serviceName}] ERROR during fetch:`)
      console.error(`  - Message: ${error.message || 'Unknown error'}`)

      if (error.response) {
        console.error(`  - Status: ${error.response.status} ${error.response.statusText}`)
      } else if (error.request) {
        console.error(`  - Status: No response received`)
      }

      if (error.config) {
        const method = error.config.method?.toUpperCase() || 'GET'
        const url = `${error.config.baseURL}${error.config.url}`
        console.error(`  - Request: ${method} ${url}`)
      }
    }

    return quotas
  }
}
