import type { AIProvider, ProviderConfig } from "../types/index.ts";

export const providerConfigs: Record<AIProvider, ProviderConfig> = {
  opencode: {
    name: "opencode zen",
    baseUrl: "https://api.opencode.ai/v1",
    quotaEndpoints: {
      usage: "/usage",
    },
    headers: {
      Authorization: "Bearer {apiKey}",
    },
  },
  amp: {
    name: "AMP",
    baseUrl: "https://ampcode.com",
    quotaEndpoints: {
      usage: "/_app/remote/w6b2h6/getFreeTierUsage",
    },
    headers: {
      Authorization: "Bearer {apiKey}",
    },
  },
  zai: {
    name: "z.ai",
    baseUrl: "https://api.z.ai",
    quotaEndpoints: {
      usage: "/usage",
    },
    headers: {
      Authorization: "Bearer {apiKey}",
    },
  },
  codex: {
    name: "OpenAI Codex",
    // Codex uses a fixed endpoint - not configurable
    quotaEndpoints: {
      usage: "/backend-api/wham/usage",
    },
    headers: {
      // Codex uses session cookie auth
    },
  },
  claude: {
    name: "Claude",
    baseUrl: "https://claude.ai",
    quotaEndpoints: {
      usage: "/api/organizations/{orgId}/usage",
    },
    headers: {
      // Claude uses session cookie auth
    },
  },
};

export function getProviderConfig(provider: AIProvider): ProviderConfig {
  return providerConfigs[provider];
}
