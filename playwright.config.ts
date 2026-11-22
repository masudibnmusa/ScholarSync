import { defineConfig, devices } from "@playwright/test";

// Black-box end-to-end tests: they drive the running app in a real browser, like a user, and import nothing from src/.
// Needs local Supabase with the seed (`npx supabase start`, `npx supabase db reset`). Starts `npm run dev` unless it is already running.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 }, // the dev server compiles each route on first visit
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /(offline|mobile)\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Phone-sized checks (layout, tab bar, full-screen chat), in Chromium with touch.
    { name: "phone", testMatch: /mobile\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    // Offline mode needs a production build: the dev server's hot-reload client won't start without its websocket.
    { name: "production", testMatch: /offline\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:3100" } },
  ],
  webServer: [
    { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
    { command: "npm run build && npm start -- -p 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 600_000 },
  ],
});
