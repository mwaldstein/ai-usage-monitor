import { BaseAIService } from './base'
import { UsageQuota, AIService } from '../types'
import { randomUUID } from 'crypto'

interface ZAISubscription {
  id: string
  customerId: string
  agreementNo: string
  productId: string
  productName: string
  description: string
  status: string
  purchaseTime: string
  valid: string
  autoRenew: number
  initialPrice: number
  standardPrice: number
  billingCycle: string
  paymentChannel: string
}

interface ZAIQuotaLimit {
  type: string
  unit: number
  number: number
  usage: number
  currentValue: number
  remaining: number
  percentage: number
  nextResetTime?: number
  usageDetails?: Array<{
    modelCode: string
    usage: number
  }>
}

interface ZAIQuotaResponse {
  code: number
  msg: string
  data: {
    limits: ZAIQuotaLimit[]
  }
}

interface ZAISubscriptionResponse {
  code: number
  msg: string
  data: ZAISubscription[]
}

export class ZAIService extends BaseAIService {
  constructor(service: AIService) {
    super(service)
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      // Check if API key (Bearer token) is provided
      if (!this.service.apiKey) {
        console.warn(
          'No API token provided for z.ai service. Please provide your Bearer token from localStorage (z-ai-open-platform-token-production or z-ai-website-token).',
        )
        return []
      }

      const quotas: UsageQuota[] = []
      const now = new Date()

      // Fetch quota limits
      const quotaResponse = await this.client.get<ZAIQuotaResponse>(
        '/api/monitor/usage/quota/limit',
        {
          headers: {
            Authorization: `Bearer ${this.service.apiKey}`,
            Accept: 'application/json',
          },
        },
      )

      if (quotaResponse.data?.code === 200 && quotaResponse.data?.data?.limits) {
        for (const limit of quotaResponse.data.data.limits) {
          const quotaId = randomUUID()

          // Create a descriptive metric name based on type
          let metricName = limit.type.toLowerCase()
          if (limit.type === 'TIME_LIMIT') {
            metricName = `requests_per_${limit.unit}min_window`
          } else if (limit.type === 'TOKENS_LIMIT') {
            metricName = 'tokens_consumption'
          }

          if (metricName === 'tokens_consumption') {
            quotas.unshift({
              id: quotaId,
              serviceId: this.service.id,
              metric: metricName,
              limit: limit.usage,
              used: limit.currentValue,
              remaining: limit.remaining,
              resetAt: limit.nextResetTime
                ? new Date(limit.nextResetTime)
                : new Date(now.getTime() + 24 * 60 * 60 * 1000),
              createdAt: new Date(),
              updatedAt: new Date(),
              type: 'usage',
            })
          } else {
            quotas.push({
              id: quotaId,
              serviceId: this.service.id,
              metric: metricName,
              limit: limit.usage,
              used: limit.currentValue,
              remaining: limit.remaining,
              resetAt: limit.nextResetTime
                ? new Date(limit.nextResetTime)
                : new Date(now.getTime() + 24 * 60 * 60 * 1000),
              createdAt: new Date(),
              updatedAt: new Date(),
              type: 'usage',
            })
          }

          // Add usage details for each model if available
          if (limit.usageDetails && limit.usageDetails.length > 0) {
            for (const detail of limit.usageDetails) {
              quotas.push({
                id: randomUUID(),
                serviceId: this.service.id,
                metric: `${detail.modelCode}_usage`,
                limit: 0, // No specific limit per model
                used: detail.usage,
                remaining: 0,
                resetAt: limit.nextResetTime
                  ? new Date(limit.nextResetTime)
                  : new Date(now.getTime() + 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                updatedAt: new Date(),
                type: 'usage',
              })
            }
          }
        }
      }

      // Fetch subscription info
      try {
        const subscriptionResponse = await this.client.get<ZAISubscriptionResponse>(
          '/api/biz/subscription/list',
          {
            headers: {
              Authorization: `Bearer ${this.service.apiKey}`,
              Accept: 'application/json',
            },
          },
        )

        if (subscriptionResponse.data?.code === 200 && subscriptionResponse.data?.data) {
          for (const sub of subscriptionResponse.data.data) {
            quotas.push({
              id: randomUUID(),
              serviceId: this.service.id,
              metric: `subscription_${sub.productId}`,
              limit: 1,
              used: sub.status === 'VALID' ? 0 : 1,
              remaining: sub.status === 'VALID' ? 1 : 0,
              resetAt: new Date(sub.valid.split('-')[1].trim()),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        }
      } catch (subError) {
        console.warn('Could not fetch z.ai subscription info:', subError)
      }

      return quotas
    } catch (error) {
      console.error(`Error fetching z.ai quotas for ${this.service.name}:`, error)
      return []
    }
  }
}
