import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { ServiceFactory } from "./factory.ts";
import type { AIProvider, AIService, ServiceStatus } from "../types/index.ts";

function makeService(provider: AIProvider): AIService {
  const now = 1700000000;
  const common = {
    id: `svc_${provider}`,
    name: `Service ${provider}`,
    provider,
    enabled: true,
    displayOrder: 1,
    createdAt: now,
    updatedAt: now,
  };

  if (provider === "opencode") {
    return {
      ...common,
      apiKey: "cookie=value",
      baseUrl: "https://opencode.ai/workspace/wrk_test123",
    };
  }

  if (provider === "codex") {
    return {
      ...common,
      bearerToken: "bearer-token",
    };
  }

  return {
    ...common,
    apiKey: "token-value",
  };
}

function okResponse<T>(
  config: InternalAxiosRequestConfig,
  data: T,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers,
    config,
    request: {},
  };
}

test("service status marks parse failures unhealthy across providers", async () => {
  const originalAdapter = axios.defaults.adapter;

  axios.defaults.adapter = async (config) => {
    const baseUrl = config.baseURL ?? "";
    const url = config.url ?? "";
    const requestPath = `${baseUrl}${url}`;

    if (requestPath.includes("api.openai.com") && url.includes("/dashboard/billing/usage")) {
      return okResponse(config, { total_usage: 2500 });
    }

    if (requestPath.includes("api.openai.com") && url.includes("/dashboard/billing/subscription")) {
      return okResponse(config, { hard_limit_usd: 100, soft_limit_usd: 80 });
    }

    if (requestPath.includes("api.anthropic.com") && url.includes("/models")) {
      return okResponse(config, {}, {
        "anthropic-ratelimit-requests-limit": "100",
        "anthropic-ratelimit-requests-remaining": "80",
        "anthropic-ratelimit-requests-reset": "1700003600",
        "anthropic-ratelimit-tokens-limit": "1000",
        "anthropic-ratelimit-tokens-remaining": "900",
        "anthropic-ratelimit-tokens-reset": "1700003600",
      });
    }

    if (requestPath.includes("opencode.ai") && url.includes("/billing")) {
      return okResponse(config, "<html><body>no hydration data</body></html>");
    }

    if (requestPath.includes("ampcode.com") && url.includes("/_app/remote/w6b2h6/getFreeTierUsage")) {
      return okResponse(config, { type: "result", result: "{}" });
    }

    if (requestPath.includes("ampcode.com") && url.includes("/settings")) {
      return okResponse(config, "<html><body>settings</body></html>");
    }

    if (requestPath.includes("api.z.ai") && url.includes("/api/monitor/usage/quota/limit")) {
      return okResponse(config, {
        code: 200,
        msg: "ok",
        data: {
          limits: [
            {
              type: "TOKENS_LIMIT",
              unit: 60,
              number: 1000,
              usage: 1000,
              currentValue: 250,
              remaining: 750,
              percentage: 25,
            },
            {
              type: "TIME_LIMIT",
              unit: 60,
              number: 100,
              currentValue: 1,
              remaining: 99,
              percentage: 1,
            },
          ],
        },
      });
    }

    if (requestPath.includes("chatgpt.com") && url.includes("/backend-api/wham/usage")) {
      return okResponse(config, { invalid: true });
    }

    throw new Error(`Unhandled request in test adapter: ${requestPath}`);
  };

  try {
    const providers: AIProvider[] = ["openai", "anthropic", "opencode", "amp", "zai", "codex"];
    const statuses: ServiceStatus[] = await Promise.all(
      providers.map((provider) => ServiceFactory.getServiceStatus(makeService(provider))),
    );

    const byProvider = new Map<AIProvider, ServiceStatus>(
      statuses.map((status) => [status.service.provider, status]),
    );

    assert.equal(byProvider.get("openai")?.isHealthy, true);
    assert.equal(byProvider.get("anthropic")?.isHealthy, true);

    assert.equal(byProvider.get("opencode")?.isHealthy, false);
    assert.equal(byProvider.get("amp")?.isHealthy, false);
    assert.equal(byProvider.get("zai")?.isHealthy, false);
    assert.equal(byProvider.get("codex")?.isHealthy, false);

    assert.equal(byProvider.get("opencode")?.error === undefined, false);
    assert.equal(byProvider.get("amp")?.error?.includes("Invalid AMP quota response payload"), true);
    assert.equal(byProvider.get("zai")?.error?.includes("Invalid z.ai quota response payload"), true);
    assert.equal(byProvider.get("codex")?.error?.includes("Invalid Codex usage response payload"), true);
  } finally {
    axios.defaults.adapter = originalAdapter;
  }
});
