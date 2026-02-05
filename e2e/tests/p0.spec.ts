import { expect, test, type Page } from "@playwright/test";

const USERNAME = "admin";
const PASSWORD = "Passw0rd!123";
const BACKEND_URL = "http://127.0.0.1:3101";
const MOCK_PROVIDER_URL = "http://127.0.0.1:4110";

async function getSetupCode(page: Page): Promise<string> {
  const response = await page.request.get(`${BACKEND_URL}/api/logs?limit=500`);
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    entries?: Array<{ message?: string }>;
  };

  const messages = payload.entries?.map((entry) => entry.message ?? "") ?? [];
  const setupMessage = [...messages].reverse().find((message) =>
    message.includes("setup code") || message.includes("register"),
  );

  if (!setupMessage) {
    throw new Error("Could not find setup code log entry");
  }

  const match = setupMessage.match(/([A-Z2-9]{6})\s*$/);
  if (!match?.[1]) {
    throw new Error(`Could not parse setup code from log message: ${setupMessage}`);
  }

  return match[1];
}

async function login(page: Page, username = USERNAME, password = PASSWORD): Promise<void> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
}

async function addOpenAiService(page: Page, name: string): Promise<void> {
  await page.getByTestId("nav-settings").click();
  await expect(page.getByRole("heading", { name: "Service Settings" })).toBeVisible();

  await page.getByTestId("add-service-button").click();
  await expect(page.getByTestId("add-service-modal")).toBeVisible();

  await page.getByTestId("service-name-input").fill(name);
  await page.getByTestId("service-api-key-input").fill("e2e-key");
  await page.getByTestId("service-base-url-input").fill(MOCK_PROVIDER_URL);
  await page.getByTestId("submit-service-button").click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function getAuthToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("aum_auth_token") ?? "");
  if (!token) {
    throw new Error("Expected auth token in localStorage");
  }
  return token;
}

test.describe.serial("P0 e2e flows", () => {
  test("first-run setup requires valid setup code", async ({ page }) => {
    await page.goto("/");

    const setupCodeInput = page.getByLabel("Setup Code");
    await expect(setupCodeInput).toBeVisible();

    await setupCodeInput.fill("AAAAAA");
    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByText("Invalid setup code", { exact: false })).toBeVisible();

    const setupCode = await getSetupCode(page);
    await page.getByLabel("Setup Code").fill(setupCode);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
  });

  test("login/logout flow persists session across reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sign in to continue")).toBeVisible();

    await page.getByLabel("Username").fill(USERNAME);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid credentials")).toBeVisible();

    await login(page);
    await page.reload();
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();

    await page.getByTestId("logout-button").click();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
  });

  test("add service renders in settings and dashboard", async ({ page }) => {
    await page.goto("/");
    await login(page);

    const serviceName = "OpenAI Mock Primary";
    await addOpenAiService(page, serviceName);

    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByText(serviceName, { exact: true })).toBeVisible();
  });

  test("refresh all updates usage and last-updated footer", async ({ page }) => {
    await page.goto("/");
    await login(page);

    const token = await getAuthToken(page);
    const servicesResponse = await page.request.get(`${BACKEND_URL}/api/services`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(servicesResponse.ok()).toBeTruthy();
    const services = (await servicesResponse.json()) as Array<{ id: string; name: string }>;
    const primary = services.find((service) => service.name === "OpenAI Mock Primary");
    if (!primary) {
      throw new Error("Expected primary service to exist before refresh test");
    }

    const quotaValue = page.getByTestId(`quota-value-${primary.id}-monthly_spend_limit`);

    await page.request.post(`${MOCK_PROVIDER_URL}/__admin/state`, {
      data: { totalUsageCents: 100 },
    });
    await page.getByTestId("refresh-all-button").click();
    await expect(quotaValue).toContainText("1.0");

    const before = (await page.getByTestId("last-updated").textContent()) ?? "";

    await page.waitForTimeout(1100);

    await page.request.post(`${MOCK_PROVIDER_URL}/__admin/state`, {
      data: { totalUsageCents: 250 },
    });
    await page.getByTestId("refresh-all-button").click();

    await expect(quotaValue).toContainText("2.5");
    await expect(page.getByTestId("last-updated")).not.toHaveText(before);
  });

  test("service reorder persists after reload", async ({ page }) => {
    await page.goto("/");
    await login(page);

    const secondService = "OpenAI Mock Secondary";
    await addOpenAiService(page, secondService);

    const token = await getAuthToken(page);
    const servicesResponse = await page.request.get(`${BACKEND_URL}/api/services`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(servicesResponse.ok()).toBeTruthy();

    const services = (await servicesResponse.json()) as Array<{ id: string; name: string }>;
    const primary = services.find((service) => service.name === "OpenAI Mock Primary");
    const secondary = services.find((service) => service.name === secondService);
    if (!primary || !secondary) {
      throw new Error("Expected both primary and secondary services to exist before reordering");
    }

    await page.getByTestId(`settings-reorder-up-${secondary.id}`).click();

    const firstSettingsName = page.locator('[data-testid^="settings-service-name-"]').first();
    await expect(firstSettingsName).toHaveText(secondService);

    await page.reload();
    await expect(page.getByTestId("nav-settings")).toBeVisible();
    await page.getByTestId("nav-settings").click();

    await expect(page.locator('[data-testid^="settings-service-name-"]').first()).toHaveText(
      secondService,
    );

    await page.getByTestId("nav-dashboard").click();
    await expect(page.locator('[data-testid^="service-card-name-"]').first()).toHaveText(secondService);
  });
});
