import { expect, test, type APIRequestContext } from "@playwright/test";
import { Schema as S, Either } from "effect";
import {
  AuthResponse,
  AuthStatusResponse,
  CachedStatusResponse,
  CreateServiceResponse,
  ListServicesResponse,
  LogsResponse,
  MeResponse,
  QuotasResponse,
  RefreshQuotasResponse,
  type RegisterRequest,
} from "shared/api";

const USERNAME = "admin";
const PASSWORD = "Passw0rd!123";
const MOCK_PROVIDER_URL = "http://127.0.0.1:4110";
const BACKEND_URL = "http://127.0.0.1:3101";
const REQUEST_TIMEOUT = 8_000;

function decodeOrThrow<A>(schema: S.Schema<A>, payload: unknown, label: string): A {
  const decoded = S.decodeUnknownEither(schema)(payload);
  if (Either.isLeft(decoded)) {
    throw new Error(`${label} failed schema decode: ${decoded.left.message}`);
  }
  return decoded.right;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchSetupCode(request: APIRequestContext): Promise<string> {
  const logsResponse = await request.get(`${BACKEND_URL}/api/logs?limit=500`, {
    timeout: REQUEST_TIMEOUT,
  });
  expect(logsResponse.ok()).toBeTruthy();

  const logsPayload = decodeOrThrow(LogsResponse, await logsResponse.json(), "logs response");
  const setupLog = [...logsPayload.entries]
    .reverse()
    .find((entry) => entry.message.includes("enter this setup code in the web UI:"));

  if (!setupLog) {
    throw new Error("Could not find setup-code log entry");
  }

  const match = setupLog.message.match(/([A-Z2-9]{6})\s*$/);
  if (!match?.[1]) {
    throw new Error(`Could not parse setup code from log: ${setupLog.message}`);
  }

  return match[1];
}

async function ensureSessionToken(request: APIRequestContext): Promise<string> {
  const statusResponse = await request.get(`${BACKEND_URL}/api/auth/status`, {
    timeout: REQUEST_TIMEOUT,
  });
  expect(statusResponse.ok()).toBeTruthy();
  const authStatus = decodeOrThrow(
    AuthStatusResponse,
    await statusResponse.json(),
    "auth status response",
  );

  if (!authStatus.hasUsers) {
    const setupCode = await fetchSetupCode(request);
    const registerBody: RegisterRequest = {
      username: USERNAME,
      password: PASSWORD,
      setupCode,
    };
    const registerResponse = await request.post(`${BACKEND_URL}/api/auth/register`, {
      data: registerBody,
      timeout: REQUEST_TIMEOUT,
    });
    expect(registerResponse.ok()).toBeTruthy();
    const registered = decodeOrThrow(AuthResponse, await registerResponse.json(), "register response");
    return registered.token;
  }

  const loginResponse = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
    timeout: REQUEST_TIMEOUT,
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loggedIn = decodeOrThrow(AuthResponse, await loginResponse.json(), "login response");
  return loggedIn.token;
}

test("critical auth/services/quotas/status APIs match shared contracts", async ({ request }) => {
  const token = await ensureSessionToken(request);

  const meResponse = await request.get(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT,
  });
  expect(meResponse.ok()).toBeTruthy();
  const me = decodeOrThrow(MeResponse, await meResponse.json(), "me response");
  expect(me.username).toBe(USERNAME);

  const createResponse = await request.post(`${BACKEND_URL}/api/services`, {
    headers: authHeaders(token),
    data: {
      name: "OpenAI Contract Service",
      provider: "openai",
      apiKey: "contract-key",
      baseUrl: MOCK_PROVIDER_URL,
    },
    timeout: REQUEST_TIMEOUT,
  });
  expect(createResponse.ok()).toBeTruthy();
  decodeOrThrow(CreateServiceResponse, await createResponse.json(), "create service response");

  const listResponse = await request.get(`${BACKEND_URL}/api/services`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT,
  });
  expect(listResponse.ok()).toBeTruthy();
  const services = decodeOrThrow(ListServicesResponse, await listResponse.json(), "list services response");
  expect(services.some((service) => service.name === "OpenAI Contract Service")).toBeTruthy();

  const refreshResponse = await request.post(`${BACKEND_URL}/api/quotas/refresh`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT,
  });
  expect(refreshResponse.ok()).toBeTruthy();
  decodeOrThrow(RefreshQuotasResponse, await refreshResponse.json(), "refresh quotas response");

  const quotasResponse = await request.get(`${BACKEND_URL}/api/quotas`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT,
  });
  expect(quotasResponse.ok()).toBeTruthy();
  decodeOrThrow(QuotasResponse, await quotasResponse.json(), "quotas response");

  const cachedStatusResponse = await request.get(`${BACKEND_URL}/api/status/cached`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: REQUEST_TIMEOUT,
  });
  expect(cachedStatusResponse.ok()).toBeTruthy();
  decodeOrThrow(CachedStatusResponse, await cachedStatusResponse.json(), "cached status response");

});
