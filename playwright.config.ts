import { defineConfig, devices } from '@playwright/test';

/**
 * T-100 end-to-end tests for the four roles against the locally running stack (backend :4000 with AUTH_DEV_BYPASS,
 * frontend :3000). Start both first (`scripts/start-all.sh`); `npm run e2e`.
 *
 * `testMatch` is deliberate. `content-manager`, `frontend-correctness` and `system-admin` drive a same-origin mock
 * API pinned to 127.0.0.1:3100 and only run under `playwright.frontend.config.ts` (`npm run e2e:frontend`);
 * without this filter they would be collected here and hang against the live stack. `auth-recovery` is listed
 * because its API-client cases run in any configuration and its browser cases skip themselves off the mock build.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['roles.spec.ts', 'auth-recovery.spec.ts'],
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
