import { defineConfig, devices } from "@playwright/test";

// E2e runs against `vite dev` (the Worker runs in workerd via the cloudflare
// plugin). Port 5198 (not 5173) so a normally-running dev server is never
// reused. Specs stub /api/apps so runs never depend on the live apps.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5198",
    trace: "on-first-retry",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: "pnpm dev --port 5198 --strictPort",
    url: "http://localhost:5198/api/health",
    reuseExistingServer: false,
  },
});
