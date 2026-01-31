import { BaseAIService } from './base.ts'
import type { UsageQuota, AIService } from '../types/index.ts'
import { randomUUID } from 'crypto'

interface OpenCodeBillingData {
  customerID: string
  balance: number
  monthlyLimit: number | null
  monthlyUsage: number
  timeMonthlyUsageUpdated: string
  subscription: {
    plan: string
    seats: number
    status: string
  }
  subscriptionID: string
}

interface OpenCodeSubscriptionData {
  plan: string
  useBalance: boolean
  rollingUsage: {
    status: string
    resetInSec: number
    usagePercent: number
  } | null
  weeklyUsage: {
    status: string
    resetInSec: number
    usagePercent: number
  } | null
}

interface OpenCodeRollingUsage {
  status: string
  resetInSec: number
  usagePercent: number
}

interface OpenCodeWeeklyUsage {
  status: string
  resetInSec: number
  usagePercent: number
}

export class OpenCodeService extends BaseAIService {
  private workspaceId: string | null = null
  private baseDomain: string = 'https://opencode.ai'

  constructor(service: AIService) {
    // Extract workspace ID before calling super
    let workspaceId: string | null = null
    let baseDomain = 'https://opencode.ai'

    if (service.baseUrl) {
      // Extract workspace ID from URL like https://opencode.ai/workspace/wrk_...
      // Workspace IDs contain lowercase letters, numbers, and uppercase letters
      const match = service.baseUrl.match(/workspace\/(wrk_[a-zA-Z0-9]+)/)
      if (match) {
        workspaceId = match[1]
      }

      // Extract base domain
      const urlMatch = service.baseUrl.match(/^(https?:\/\/[^\/]+)/)
      if (urlMatch) {
        baseDomain = urlMatch[1]
      }
    }

    // Create modified service with just the base domain for axios
    const modifiedService = {
      ...service,
      baseUrl: baseDomain,
    }

    super(modifiedService)
    this.workspaceId = workspaceId
    this.baseDomain = baseDomain
  }

  private extractWorkspaceId(): string | null {
    return this.workspaceId
  }

  private parseHydrationData(html: string): {
    billing?: OpenCodeBillingData
    subscription?: OpenCodeSubscriptionData
    rollingUsage?: OpenCodeRollingUsage
    weeklyUsage?: OpenCodeWeeklyUsage
  } {
    const result: {
      billing?: OpenCodeBillingData
      subscription?: OpenCodeSubscriptionData
      rollingUsage?: OpenCodeRollingUsage
      weeklyUsage?: OpenCodeWeeklyUsage
    } = {}

    try {
      // Strategy 1: Look for all $R[22]($R[X],$R[Y]={...}) patterns
      // These are SolidJS hydration calls that resolve promises with data
      const allCalls = html.match(/\$R\[22\]\(\$R\[(\d+)\],\$R\[(\d+)\]=\{/g)

      if (allCalls) {
        for (const call of allCalls) {
          // Extract the second $R index (contains the data)
          const dataIndexMatch = call.match(/\$R\[(\d+)\]=\{$/)
          if (dataIndexMatch) {
            const dataIndex = dataIndexMatch[1]

            // Extract the full object by finding $R[index]={ and tracking to matching }
            const startPattern = new RegExp(`\\$R\\[${dataIndex}\\]=\\{`)
            const startMatch = html.match(startPattern)

            if (startMatch) {
              const startIdx = startMatch.index!
              let braceCount = 1
              let endIdx = startIdx + startMatch[0].length

              // Find matching closing brace
              while (braceCount > 0 && endIdx < html.length) {
                if (html[endIdx] === '{') braceCount++
                else if (html[endIdx] === '}') braceCount--
                endIdx++
              }

              const dataStr = html.substring(startIdx, endIdx)

              // Check if this is billing data (has customerID)
              if (dataStr.includes('customerID')) {
                const parsed = this.parseObject(dataStr)
                if (parsed) {
                  result.billing = parsed
                  console.log('Found billing data:', parsed)
                }
              }

              // Check if this is subscription data (has rollingUsage or plan)
              if (
                dataStr.includes('rollingUsage') ||
                dataStr.includes('weeklyUsage') ||
                dataStr.includes('plan')
              ) {
                const parsed = this.parseObject(dataStr)
                if (parsed && parsed.plan) {
                  result.subscription = parsed
                  console.log('Found subscription data:', parsed)
                }
              }
            }
          }
        }
      }

      // Strategy 2: Direct pattern matching for common structures
      if (!result.billing) {
        // Try to find any object with customerID
        const billingObjects = html.match(/\$R\[\d+\]=\{customerID:[^}]+\}/g)
        if (billingObjects) {
          for (const obj of billingObjects) {
            const parsed = this.parseObject(obj)
            if (parsed && parsed.customerID) {
              result.billing = parsed
              console.log('Found billing via direct pattern:', parsed)
              break
            }
          }
        }
      }

      // Strategy 3: Look for subscription data with plan
      if (!result.subscription) {
        const subObjects = html.match(/\$R\[\d+\]=\{[^}]*plan:[^}]*\}/g)
        if (subObjects) {
          for (const obj of subObjects) {
            const parsed = this.parseObject(obj)
            if (parsed && parsed.plan) {
              result.subscription = parsed
              console.log('Found subscription via direct pattern:', parsed)
              break
            }
          }
        }
      }

      // Strategy 4 & 5: Extract rolling and weekly usage from subscription object
      // Look for the subscription object that has both rollingUsage and weeklyUsage
      const subWithUsage = html.match(
        /\$R\[\d+\]=\{[^}]*plan:[^}]*rollingUsage:\$R\[\d+\]=\{[^}]*\}[^}]*weeklyUsage:\$R\[\d+\]=\{[^}]*\}[^}]*\}/,
      )
      if (subWithUsage) {
        // Extract rollingUsage: $R[X]={status:"...",resetInSec:Y,usagePercent:Z}
        const rollingMatch = subWithUsage[0].match(
          /rollingUsage:\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/,
        )
        if (rollingMatch && !result.rollingUsage) {
          const rollingStr = rollingMatch[1]
          // Parse directly without $R prefix
          const parsed = this.parseDirectObject(rollingStr)
          if (parsed && parsed.status && parsed.usagePercent !== undefined) {
            result.rollingUsage = {
              status: parsed.status,
              resetInSec: parseInt(parsed.resetInSec),
              usagePercent: parseInt(parsed.usagePercent),
            }
            console.log('Found rolling usage (from subscription):', result.rollingUsage)
          }
        }

        // Extract weeklyUsage: $R[X]={status:"...",resetInSec:Y,usagePercent:Z}
        const weeklyMatch = subWithUsage[0].match(
          /weeklyUsage:\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/,
        )
        if (weeklyMatch && !result.weeklyUsage) {
          const weeklyStr = weeklyMatch[1]
          // Parse directly without $R prefix
          const parsed = this.parseDirectObject(weeklyStr)
          if (parsed && parsed.status && parsed.usagePercent !== undefined) {
            result.weeklyUsage = {
              status: parsed.status,
              resetInSec: parseInt(parsed.resetInSec),
              usagePercent: parseInt(parsed.usagePercent),
            }
            console.log('Found weekly usage (from subscription):', result.weeklyUsage)
          }
        }
      }

      // Fallback: If still not found, look for standalone usage objects by property name context
      if (!result.rollingUsage || !result.weeklyUsage) {
        const allUsageMatches = html.matchAll(
          /(rollingUsage|weeklyUsage):\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/g,
        )
        for (const match of allUsageMatches) {
          const type = match[1] // 'rollingUsage' or 'weeklyUsage'
          const dataStr = match[2]
          // Parse directly without $R prefix
          const parsed = this.parseDirectObject(dataStr)
          if (parsed && parsed.status && parsed.usagePercent !== undefined) {
            const usageData = {
              status: parsed.status,
              resetInSec: parseInt(parsed.resetInSec),
              usagePercent: parseInt(parsed.usagePercent),
            }
            if (type === 'rollingUsage' && !result.rollingUsage) {
              result.rollingUsage = usageData
              console.log('Found rolling usage (from property):', usageData)
            } else if (type === 'weeklyUsage' && !result.weeklyUsage) {
              result.weeklyUsage = usageData
              console.log('Found weekly usage (from property):', usageData)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error parsing hydration data:', error)
    }

    return result
  }

  private replaceNestedR(dataStr: string): string {
    // Replace $R[digits]={...} or $R[digits]=new Date(...) with null
    const result: string[] = []
    let i = 0

    while (i < dataStr.length) {
      // Check for $R[digits]={...}
      const rObjectMatch = dataStr.slice(i).match(/^\$R\[\d+\]=\{/)
      if (rObjectMatch) {
        // Found $R[...]={, skip past it and find matching }
        let braceCount = 1
        let j = i + rObjectMatch[0].length
        while (braceCount > 0 && j < dataStr.length) {
          if (dataStr[j] === '{') braceCount++
          else if (dataStr[j] === '}') braceCount--
          j++
        }
        // Replace entire $R[...]={...} with null
        result.push('null')
        i = j
        continue
      }

      // Check for $R[digits]=new Date("...")
      const rDateMatch = dataStr.slice(i).match(/^\$R\[\d+\]=new Date\("([^"]*)"\)/)
      if (rDateMatch) {
        // Replace with just the date string
        result.push(`"${rDateMatch[1]}"`)
        i += rDateMatch[0].length
        continue
      }

      result.push(dataStr[i])
      i++
    }

    return result.join('')
  }

  // Parse object directly without $R prefix (for nested objects extracted from parent)
  private parseDirectObject(objStr: string): any {
    try {
      let dataStr = objStr

      // Handle nested $R references
      dataStr = this.replaceNestedR(dataStr)

      // Handle truncation - detect incomplete property names at end
      if (dataStr.match(/[,{]\s*\w+$/)) {
        dataStr = dataStr.replace(/[,{]\s*\w+$/, '')
      }

      // Remove any ... markers
      dataStr = dataStr.replace(/\.\.\./g, '')

      // Ensure proper closing brace
      if (!dataStr.endsWith('}')) {
        dataStr += '}'
      }

      // Convert JavaScript object notation to JSON
      let jsonStr = dataStr
        // Quote property names
        .replace(/([{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
        // Handle boolean shorthand: !0 = true, !1 = false
        .replace(/:!0/g, ':true')
        .replace(/:!1/g, ':false')
        // Quote unquoted string values
        .replace(/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match, p1) => {
          if (['null', 'true', 'false'].includes(p1)) return match
          return `:"${p1}"`
        })

      return JSON.parse(jsonStr)
    } catch (e) {
      console.error('Failed to parse direct object:', objStr.substring(0, 150))
      console.error('Error:', (e as Error).message)
      return null
    }
  }

  private parseObject(objStr: string, html?: string): any {
    try {
      // Remove the $R[index]= prefix
      let dataStr = objStr.replace(/^\$R\[\d+\]=/, '')

      // Use the same logic as parseDirectObject
      return this.parseDirectObject(dataStr)
    } catch (e) {
      console.error('Failed to parse object:', objStr.substring(0, 150))
      console.error('Error:', (e as Error).message)
      return null
    }
  }

  async fetchQuotas(): Promise<UsageQuota[]> {
    try {
      const workspaceId = this.extractWorkspaceId()
      if (!workspaceId) {
        console.warn(
          'No workspace ID found for opencode service. Set baseUrl to include workspace ID (e.g., https://opencode.ai/workspace/WRK_ID)',
        )
        return []
      }

      // Check if API key (session cookie) is provided
      if (!this.service.apiKey) {
        console.warn(
          'No session cookie provided for opencode service. Authentication required. Please copy your session cookie from the browser and paste it as the API key.',
        )
        return []
      }

      // Fetch the billing page HTML with session cookie
      const response = await this.client.get(`/workspace/${workspaceId}/billing`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: this.service.apiKey,
        },
      })

      const html = response.data

      // Check if we got HTML back
      if (!html || typeof html !== 'string' || html.length === 0) {
        console.error(`Empty or invalid HTML response for ${this.service.name}`)
        throw new Error('Invalid response: empty HTML')
      }

      // Log the first part of HTML for debugging
      console.log(`HTML response preview (first 300 chars): ${html.substring(0, 300)}`)

      // Save full HTML to file for debugging if parsing fails
      const fs = require('fs')
      const path = require('path')
      const debugDir = path.join(process.cwd(), 'debug')
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true })
      }
      const debugFile = path.join(debugDir, `opencode-${this.service.name}-${Date.now()}.html`)
      fs.writeFileSync(debugFile, html, 'utf8')
      console.log(`Saved full HTML to: ${debugFile}`)

      // First, try to parse the data
      const data = this.parseHydrationData(html)

      // Check if we found billing/subscription/usage data - if yes, we're good
      if (data.billing || data.subscription || data.rollingUsage || data.weeklyUsage) {
        console.log(`Successfully found quota data for ${this.service.name}`)
      } else {
        // No data found - check if we're on a login/auth page
        const isAuthPage =
          html.includes('<title>OpenAuth</title>') ||
          html.includes('window.location.href = ') ||
          html.includes('"auth":') ||
          (html.includes('login') && html.includes('password'))

        if (isAuthPage) {
          console.error(`Authentication required for ${this.service.name} - received login page`)
          console.error(`Full HTML (first 1000 chars): ${html.substring(0, 1000)}`)
          const error = new Error(
            'Authentication failed: Session cookie expired or invalid. Please get a new session cookie from your browser.',
          )
          ;(error as any).code = 'UNAUTHORIZED'
          throw error
        } else {
          // Not an auth page, but no data found - page structure might have changed
          console.error(`No billing or subscription data found in HTML for ${this.service.name}`)
          console.error(`Check saved HTML file for full content: ${debugFile}`)
          throw new Error('No quota data found in response. Check debug/opencode-*.html files.')
        }
      }

      const quotas: UsageQuota[] = []
      const now = new Date()

      // Add rolling usage (5-hour window) - from subscription or directly parsed
      // Burn down approach: invert the percentage so bar shows remaining capacity
      // When page shows 80% used, burn down shows 20% remaining to burn
      const rollingUsage = data.rollingUsage || data.subscription?.rollingUsage
      if (rollingUsage) {
        const pagePercent = rollingUsage.usagePercent // What page shows (usage %)
        const burnDownPercent = 100 - pagePercent // Remaining capacity (burn down value)
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'rolling_5hour_usage',
          limit: 100,
          used: pagePercent, // Original usage from page (for reference)
          remaining: burnDownPercent, // Burn down: remaining capacity
          resetAt: new Date(now.getTime() + rollingUsage.resetInSec * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'usage', // Burn down display - bar empties as you use it
        })
        console.log(
          `Added rolling usage quota: ${pagePercent}% page value → ${burnDownPercent}% burn down remaining`,
        )
      }

      // Add weekly usage - from subscription or directly parsed
      // Burn down approach: invert the percentage so bar shows remaining capacity
      // When page shows 80% used, burn down shows 20% remaining to burn
      const weeklyUsage = data.weeklyUsage || data.subscription?.weeklyUsage
      if (weeklyUsage) {
        const pagePercent = weeklyUsage.usagePercent // What page shows (usage %)
        const burnDownPercent = 100 - pagePercent // Remaining capacity (burn down value)
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'weekly_usage',
          limit: 100,
          used: pagePercent, // Original usage from page (for reference)
          remaining: burnDownPercent, // Burn down: remaining capacity
          resetAt: new Date(now.getTime() + weeklyUsage.resetInSec * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'usage', // Burn down display - bar empties as you use it
        })
        console.log(
          `Added weekly usage quota: ${pagePercent}% page value → ${burnDownPercent}% burn down remaining`,
        )
      }

      // Add monthly usage if available
      if (data.billing?.monthlyUsage !== undefined && data.billing?.monthlyLimit !== null) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'monthly_usage',
          limit: data.billing.monthlyLimit,
          used: data.billing.monthlyUsage,
          remaining: data.billing.monthlyLimit - data.billing.monthlyUsage,
          resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      // Add balance
      if (data.billing?.balance !== undefined) {
        // Balance is stored in smallest units (divide by 1e8 for dollars)
        const balanceDollars = data.billing.balance / 1e8
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'account_balance',
          limit: balanceDollars,
          used: 0,
          remaining: balanceDollars,
          resetAt: new Date(now.getTime() + 86400000 * 365), // 1 year
          createdAt: new Date(),
          updatedAt: new Date(),
          type: 'credits', // Credit balance style - focus on remaining
        })
      }

      // Add subscription plan
      if (data.billing?.subscription?.plan) {
        quotas.push({
          id: randomUUID(),
          serviceId: this.service.id,
          metric: 'subscription_plan',
          limit: parseInt(data.billing.subscription.plan) || 0,
          used: 0,
          remaining: parseInt(data.billing.subscription.plan) || 0,
          resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      return quotas
    } catch (error) {
      console.error(`Error fetching opencode quotas for ${this.service.name}:`, error)
      return []
    }
  }
}
