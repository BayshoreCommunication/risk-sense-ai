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
  await accountMenu.getByTestId('account-menu-trigger').click();
  await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  return accountMenu;
}

async function expectRootTheme(page: Page, theme: 'light' | 'dark', preference: 'system' | 'light' | 'dark') {
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', theme);
  await expect(root).toHaveAttribute('data-theme-preference', preference);
  if (theme === 'dark') await expect(root).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  else await expect(root).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
}

test('theme defaults to the device and System, Light, and Dark choices persist correctly [DASH-04, NFR-08]', async ({ page }) => {
  const hydrationMessages: string[] = [];
  page.on('console', (message) => {
    if (/hydration|did not match|server rendered/i.test(message.text())) hydrationMessages.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server rendered/i.test(error.message)) hydrationMessages.push(error.message);
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await prepareWorkspace(page);
  await page.goto('/chat');
  await expectRootTheme(page, 'dark', 'system');

  let accountMenu = await openAccountMenu(page);
  let themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  await expect(themeGroup).toBeVisible();
  await expect(themeGroup.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await expect(themeGroup.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
  await expect(themeGroup.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');

  await themeGroup.getByRole('radio', { name: 'Light' }).click();
  await expectRootTheme(page, 'light', 'light');
  await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'rs_theme')?.value).toBe('light');

  await page.reload();
  await expectRootTheme(page, 'light', 'light');
  accountMenu = await openAccountMenu(page);
  themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  await expect(themeGroup.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');

  await themeGroup.getByRole('radio', { name: 'Dark' }).click();
  await expectRootTheme(page, 'dark', 'dark');
  await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'rs_theme')?.value).toBe('dark');

  await page.reload();
  await expectRootTheme(page, 'dark', 'dark');
  accountMenu = await openAccountMenu(page);
  themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  await expect(themeGroup.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

  await themeGroup.getByRole('radio', { name: 'System' }).click();
  await expectRootTheme(page, 'dark', 'system');
  await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === 'rs_theme')?.value).toBe('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectRootTheme(page, 'light', 'system');
  expect(hydrationMessages).toEqual([]);
});

test('account menu stays open during rapid theme changes [DASH-04, NFR-08]', async ({ page }) => {
  await prepareWorkspace(page);
  await page.goto('/chat');

  const accountMenu = await openAccountMenu(page);
  const themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  const darkBox = await themeGroup.getByRole('radio', { name: 'Dark' }).boundingBox();
  expect(darkBox).not.toBeNull();
  await page.evaluate(({ x, y }) => {
    document.documentElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
  }, { x: darkBox!.x + darkBox!.width / 2, y: darkBox!.y + darkBox!.height / 2 });
  await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');

  for (const name of ['Dark', 'Light', 'Dark', 'System', 'Light'] as const) {
    await themeGroup.getByRole('radio', { name }).click();
    await expect(accountMenu.getByTestId('account-menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  }

  await expectRootTheme(page, 'light', 'light');
});

test('three-option theme control stays English when a stale Bengali preference is present [NFR-08]', async ({ page }) => {
  await prepareWorkspace(page, 'bn');
  await page.goto('/chat');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const accountMenu = await openAccountMenu(page);
  const themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  await expect(themeGroup).toBeVisible();
  await expect(themeGroup.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await expect(themeGroup.getByRole('radio')).toHaveCount(3);
  await expect(accountMenu.getByTestId('language-indicator')).toContainText('English');
  await expect(accountMenu.getByText('বাংলা', { exact: true })).toHaveCount(0);
});

test('three-option theme control remains available at a 390px mobile viewport [DASH-04, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareWorkspace(page);
  await page.goto('/chat');

  const accountMenu = await openAccountMenu(page);
  const themeGroup = accountMenu.getByRole('radiogroup', { name: 'Theme' });
  await expect(themeGroup).toBeVisible();
  const groupBox = await themeGroup.boundingBox();
  expect(groupBox).not.toBeNull();
  expect(groupBox!.x).toBeGreaterThanOrEqual(0);
  expect(groupBox!.x + groupBox!.width).toBeLessThanOrEqual(390);

  await themeGroup.getByRole('radio', { name: 'Dark' }).click();
  await expectRootTheme(page, 'dark', 'dark');
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
  await accountMenu.getByRole('radio', { name: 'Dark' }).click();
  await expectRootTheme(page, 'dark', 'dark');

  const transitionClasses = await page.evaluate(() => (window as typeof window & { __themeTransitionClasses?: string[] }).__themeTransitionClasses ?? []);
  expect(
    transitionClasses.some((className) => {
      const classes = className.split(/\s+/);
      return classes.includes('theme-transitioning') || classes.includes('theme-view-transition');
    }),
  ).toBe(false);
});
