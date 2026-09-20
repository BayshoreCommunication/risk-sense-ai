import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const testEnvironment = `NEXT_PUBLIC_ENV=ci NEXT_PUBLIC_API_URL=${baseURL}/test-api NEXT_PUBLIC_FIREBASE_API_KEY=frontend-test-key NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=auth.example.test NEXT_PUBLIC_FIREBASE_PROJECT_ID=frontend-test NEXT_PUBLIC_DEMO_PASSWORD=frontend-demo-password`;

/** Fast frontend correctness checks with the browser intercepting a same-origin mock API. */
export default defineConfig({
  testDir: './e2e',
  metadata: { frontendMocks: true },
  testMatch: ['frontend-correctness.spec.ts', 'content-manager.spec.ts', 'system-admin.spec.ts', 'auth-recovery.spec.ts', 'theme-mode.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/frontend-correctness',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `${testEnvironment} npm run build && ${testEnvironment} npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
