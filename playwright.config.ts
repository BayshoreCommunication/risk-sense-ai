import { defineConfig, devices } from '@playwright/test';

/**
 * T-100 end-to-end tests for the four roles against the locally running stack (backend :4000 with AUTH_DEV_BYPASS,
 * frontend :3000). Start both first (`scripts/start-all.sh`); `npm run e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
});
