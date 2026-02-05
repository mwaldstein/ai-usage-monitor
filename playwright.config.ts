import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 3101;
const MOCK_PROVIDER_PORT = 4110;
const E2E_DATA_DIR = `${process.cwd()}/.tmp/e2e-data`;

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: `node e2e/mock-provider-server.mjs ${MOCK_PROVIDER_PORT}`,
      url: `http://127.0.0.1:${MOCK_PROVIDER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run generate-version -w backend && npm run start -w backend",
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        REFRESH_INTERVAL: "0 0 1 1 *",
        DATA_DIR: E2E_DATA_DIR,
        NODE_ENV: "test",
      },
    },
    {
      command: `npm run dev -w frontend -- --host 127.0.0.1 --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        VITE_BACKEND_ORIGIN: `http://127.0.0.1:${BACKEND_PORT}`,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
});
