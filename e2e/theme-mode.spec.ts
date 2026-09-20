import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

function currentRequestor() {
  return {
    user: {
      id: 'theme-user-1',
      firebaseUid: 'test:theme-user-1',
      email: 'requestor@example.test',
      name: 'Theme Test User',
      role: 'requestor',
      tenantId: 'tenant-1',
      departmentIds: [],
      crossDepartmentAccess: false,
      mfaEnrolled: true,
    },
    tenant: {
      id: 'tenant-1',
      slug: 'test',
      plan: 'free',
      sectors: ['financial'],
      features: {
        sso: false,
        reviewDashboard: false,
        reports: false,
        fullAudit: false,
        departmentMapping: false,
        blockConcurrentLogin: false,
      },
      sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
    },
    sessionId: 'theme-session-1',
  };
}

async function ok(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ data, meta: { requestId: 'theme-playwright' } }),
  });
}

async function prepareWorkspace(page: Page, locale: 'en' | 'bn' = 'en') {
  await page.context().addCookies([
    { name: 'rs_session', value: 'theme-session-1', url: BASE_URL },
    { name: 'rs_role', value: 'requestor', url: BASE_URL },
    { name: 'rs_locale', value: locale, url: BASE_URL },
  ]);

  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/me') {
      await ok(route, currentRequestor());
      return;
    }
    if (path === '/personas') {
      await ok(route, []);
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `No mock exists for ${path}` } }),
    });
  });
}

async function openAccountMenu(page: Page) {
  const accountMenu = page.getByTestId('account-menu');
  await accountMenu.locator('summary').click();
  await expect(accountMenu).toHaveAttribute('open', '');
  return accountMenu;
}

async function expectRootTheme(page: Page, theme: 'light' | 'dark') {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', theme);
  if (theme === 'dark') await expect(root).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  else await expect(root).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
}

test('account theme switch defaults to light, persists dark across reload, and returns to light [DASH-04, NFR-08]', async ({ page }) => {
  const hydrationMessages: string[] = [];
  page.on('console', (message) => {
    if (/hydration|did not match|server rendered/i.test(message.text())) hydrationMessages.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server rendered/i.test(error.message)) hydrationMessages.push(error.message);
  });

  await prepareWorkspace(page);
  await page.goto('/chat');
  await expectRootTheme(page, 'light');

  let accountMenu = await openAccountMenu(page);
  let themeSwitch = accountMenu.getByRole('switch');
  await expect(themeSwitch).toBeVisible();
  await expect(themeSwitch).toHaveAccessibleName(/dark mode/i);
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');

  await themeSwitch.click();
  await expectRootTheme(page, 'dark');
  themeSwitch = accountMenu.getByRole('switch');
  await expect(themeSwitch).toHaveAccessibleName(/dark mode/i);
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'rs_theme')?.value).toBe('dark');

  await page.reload();
  await expectRootTheme(page, 'dark');
  accountMenu = await openAccountMenu(page);
  themeSwitch = accountMenu.getByRole('switch');
  await expect(themeSwitch).toHaveAccessibleName(/dark mode/i);
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
  expect(hydrationMessages).toEqual([]);

  await themeSwitch.click();
  await expectRootTheme(page, 'light');
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'rs_theme')?.value).toBe('light');
});

test('theme switch uses its Bengali accessible label [NFR-08]', async ({ page }) => {
  await prepareWorkspace(page, 'bn');
  await page.goto('/chat');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');

  const accountMenu = await openAccountMenu(page);
  const themeSwitch = accountMenu.getByRole('switch');
  await expect(themeSwitch).toBeVisible();
  await expect(themeSwitch).toHaveAccessibleName(/ডার্ক মোড/);
  await expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
});

test('theme switch remains available in the account menu at a 390px mobile viewport [DASH-04, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareWorkspace(page);
  await page.goto('/chat');

  const accountMenu = await openAccountMenu(page);
  const themeSwitch = accountMenu.getByRole('switch');
  await expect(themeSwitch).toBeVisible();
  await expect(themeSwitch).toHaveAccessibleName(/dark mode/i);
  const switchBox = await themeSwitch.boundingBox();
  expect(switchBox).not.toBeNull();
  expect(switchBox!.x).toBeGreaterThanOrEqual(0);
  expect(switchBox!.x + switchBox!.width).toBeLessThanOrEqual(390);

  await themeSwitch.click();
  await expectRootTheme(page, 'dark');
});

test('reduced-motion preference skips theme transition markers [NFR-08]', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareWorkspace(page);
  await page.goto('/chat');
  await page.evaluate(() => {
    const transitionClasses: string[] = [];
    Object.assign(window, { __themeTransitionClasses: transitionClasses });
    new MutationObserver(() => transitionClasses.push(document.documentElement.className)).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  const accountMenu = await openAccountMenu(page);
  await accountMenu.getByRole('switch').click();
  await expectRootTheme(page, 'dark');

  const transitionClasses = await page.evaluate(() => (window as typeof window & { __themeTransitionClasses?: string[] }).__themeTransitionClasses ?? []);
  expect(
    transitionClasses.some((className) => {
      const classes = className.split(/\s+/);
      return classes.includes('theme-transitioning') || classes.includes('theme-view-transition');
    }),
  ).toBe(false);
});
