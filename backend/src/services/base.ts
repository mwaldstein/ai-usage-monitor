import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { AIService, UsageQuota, ServiceStatus, AIProvider } from '../types/index.js'
import { providerConfigs } from './providers.js'

export abstract class BaseAIService {
  protected client: AxiosInstance
  protected service: AIService

  constructor(service: AIService) {
    this.service = service
    const config = providerConfigs[service.provider as AIProvider]

    let baseURL = service.baseUrl || config.baseUrl
    if (service.provider === 'azure' && baseURL && service.baseUrl) {
      baseURL = baseURL.replace('{endpoint}', service.baseUrl)
    }

    // Some providers (like Codex) don't use the base client - they create their own
    // For those cases, we create a minimal client that won't be used
    this.client = axios.create({
      baseURL: baseURL || 'http://localhost',
      timeout: 10000,
      headers: this.buildHeaders(config.headers || {}, service.apiKey || ''),
    })
  }

  private buildHeaders(template: Record<string, string>, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(template)) {
      headers[key] = value.replace('{apiKey}', apiKey)
    }
    return headers
  }

  abstract fetchQuotas(): Promise<UsageQuota[]>

  async getStatus(): Promise<ServiceStatus> {
    try {
      const quotas = await this.fetchQuotas()
      return {
        service: this.service,
        quotas,
        lastUpdated: new Date(),
        isHealthy: true,
        authError: false,
      }
    } catch (error) {
      return {
        service: this.service,
        quotas: [],
        lastUpdated: new Date(),
        isHealthy: false,
        authError: this.isAuthError(error),
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  protected isAuthError(error: any): boolean {
    // Check for common authentication error patterns
    if (error?.response?.status === 401) return true
    if (error?.response?.status === 403) return true
    if (error?.response?.status === 429) return true
    if (error?.code === 'UNAUTHORIZED') return true
    if (error?.code === 'INVALID_TOKEN') return true
    if (error?.code === 'TOKEN_EXPIRED') return true

    // Check for rate limiting that might be auth-related
    if (
      error?.response?.status === 429 &&
      (error?.response?.data?.message?.includes('token') ||
        error?.response?.data?.message?.includes('auth'))
    )
      return true

    return false
  }
}
