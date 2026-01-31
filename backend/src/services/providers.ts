import { AIProvider, ProviderConfig } from '../types/index.js'

export const providerConfigs: Record<AIProvider, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    quotaEndpoints: {
      usage: '/usage',
      limits: '/dashboard/billing/limits',
    },
    headers: {
      Authorization: 'Bearer {apiKey}',
    },
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    quotaEndpoints: {
      usage: '/usage',
    },
    headers: {
      'x-api-key': '{apiKey}',
      'anthropic-version': '2023-06-01',
    },
  },
  google: {
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    quotaEndpoints: {
      usage: '/usage',
    },
    headers: {
      Authorization: 'Bearer {apiKey}',
    },
  },
  aws: {
    name: 'AWS Bedrock',
    baseUrl: 'https://bedrock-runtime.{region}.amazonaws.com',
    headers: {
      // AWS uses signature-based auth
    },
  },
  opencode: {
    name: 'opencode zen',
    baseUrl: 'https://api.opencode.ai/v1',
    quotaEndpoints: {
      usage: '/usage',
    },
    headers: {
      Authorization: 'Bearer {apiKey}',
    },
  },
  amp: {
    name: 'AMP',
    baseUrl: 'https://ampcode.com',
    quotaEndpoints: {
      usage: '/_app/remote/w6b2h6/getFreeTierUsage',
    },
    headers: {
      Authorization: 'Bearer {apiKey}',
    },
  },
  zai: {
    name: 'z.ai',
    baseUrl: 'https://api.z.ai',
    quotaEndpoints: {
      usage: '/usage',
    },
    headers: {
      Authorization: 'Bearer {apiKey}',
    },
  },
  codex: {
    name: 'OpenAI Codex',
    // Codex uses a fixed endpoint - not configurable
    quotaEndpoints: {
      usage: '/backend-api/wham/usage',
    },
    headers: {
      // Codex uses session cookie auth
    },
  },
}

export function getProviderConfig(provider: AIProvider): ProviderConfig {
  return providerConfigs[provider]
}
