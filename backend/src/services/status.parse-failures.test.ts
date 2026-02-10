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

  if (provider === "openai") {
    return {
      ...common,
      apiKey: "Bearer openai-token",
    };
  }

  if (provider === "zai") {
    return {
      ...common,
      bearerToken: "Bearer zai-token",
    };
  }

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
      bearerToken: "Bearer codex-token",
    };
  }

  return {
    ...common,
    apiKey: "token-value",
  };
}

function hasAuthorizationHeader(
  config: InternalAxiosRequestConfig,
  expectedValue: string,
): boolean {
  const headersJson = JSON.stringify(config.headers ?? {});
  return (
    headersJson.includes(`"Authorization":"${expectedValue}"`) ||
    headersJson.includes(`"authorization":"${expectedValue}"`)
  );
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
      assert.equal(hasAuthorizationHeader(config, "Bearer openai-token"), true);
      return okResponse(config, { total_usage: 2500 });
    }

    if (requestPath.includes("api.openai.com") && url.includes("/dashboard/billing/subscription")) {
      assert.equal(hasAuthorizationHeader(config, "Bearer openai-token"), true);
      return okResponse(config, { hard_limit_usd: 100, soft_limit_usd: 80 });
    }

    if (requestPath.includes("api.anthropic.com") && url.includes("/models")) {
      return okResponse(
        config,
        {},
        {
          "anthropic-ratelimit-requests-limit": "100",
          "anthropic-ratelimit-requests-remaining": "80",
          "anthropic-ratelimit-requests-reset": "1700003600",
          "anthropic-ratelimit-tokens-limit": "1000",
          "anthropic-ratelimit-tokens-remaining": "900",
          "anthropic-ratelimit-tokens-reset": "1700003600",
        },
      );
    }

    if (requestPath.includes("opencode.ai") && url.includes("/billing")) {
      return okResponse(config, "<html><body>no hydration data</body></html>");
    }

    if (
      requestPath.includes("ampcode.com") &&
      url.includes("/_app/remote/w6b2h6/getFreeTierUsage")
    ) {
      return okResponse(config, { type: "result", result: "{}" });
    }

    if (requestPath.includes("ampcode.com") && url.includes("/settings")) {
      return okResponse(config, "<html><body>settings</body></html>");
    }

    if (requestPath.includes("api.z.ai") && url.includes("/api/monitor/usage/quota/limit")) {
      assert.equal(hasAuthorizationHeader(config, "Bearer zai-token"), true);
      return okResponse(config, {
        code: 200,
        msg: "ok",
        data: {
          limits: [
            {
              type: "TIME_LIMIT",
              unit: 60,
              number: 100,
              currentValue: 1,
              remaining: 99,
              percentage: 1,
            },
            {
              type: "TOKENS_LIMIT",
              unit: 3,
              number: 5,
              percentage: 0,
            },
          ],
        },
      });
    }

    if (requestPath.includes("chatgpt.com") && url.includes("/backend-api/wham/usage")) {
      assert.equal(hasAuthorizationHeader(config, "Bearer codex-token"), true);
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
    assert.equal(byProvider.get("zai")?.isHealthy, true);
    assert.equal((byProvider.get("zai")?.quotas.length ?? 0) > 0, true);
    const zaiQuotas = byProvider.get("zai")?.quotas ?? [];
    const tokenQuota = zaiQuotas.find((quota) => quota.metric === "tokens_consumption");
    assert.equal(tokenQuota?.limit, 5);
    assert.equal(tokenQuota?.used, 0);
    assert.equal(tokenQuota?.remaining, 5);
    assert.equal(byProvider.get("codex")?.isHealthy, false);

    assert.equal(byProvider.get("opencode")?.error === undefined, false);
    assert.equal(
      byProvider.get("amp")?.error?.includes("Invalid AMP quota response payload"),
      true,
    );
    assert.equal(byProvider.get("zai")?.error, undefined);
    assert.equal(
      byProvider.get("codex")?.error?.includes("Invalid Codex usage response payload"),
      true,
    );
  } finally {
    axios.defaults.adapter = originalAdapter;
  }
});
