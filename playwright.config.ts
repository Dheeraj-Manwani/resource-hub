import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"

config({ path: ".env", quiet: true })
config({ path: ".env.local", override: true, quiet: true })

const PORT = Number(process.env.E2E_PORT ?? 3000)

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 600_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list", { printSteps: true }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    launchOptions: { slowMo: process.argv.includes("--headed") ? 250 : 0 },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      testMatch: "smoke.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Reuse local dev when available. Each browser gets a fresh test account;
    // authenticated journeys verify its identity before touching app data.
    reuseExistingServer: !process.env.CI,
    env: {
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      PLAYWRIGHT_SERVER: "1",
    },
    timeout: 120_000,
  },
})
