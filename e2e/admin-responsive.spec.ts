import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

const ADMIN_ROUTES = [
  ['/admin', 'Admin configuration home'],
  ['/admin/personas', 'Persona management'],
  ['/admin/scenarios', 'Scenario library management'],
  ['/admin/questions', 'Question bank management'],
  ['/admin/rules', 'Rule engine — hard business rules'],
  ['/admin/scoring', 'Scoring matrix configuration'],
  ['/admin/datasets', 'AI training dataset management'],
  ['/admin/analytics', 'Analytics dashboard'],
  ['/admin/reports', 'Standard reports'],
  ['/admin/review', 'Mandatory review queue'],
] as const;

const currentAdministrator = {
  user: {
    id: 'admin-1',
    firebaseUid: 'test:admin-1',
    email: 'administrator@example.test',
    name: 'Responsive Administrator',
    role: 'administrator',
    tenantId: 'tenant-1',
    departmentIds: [],
    crossDepartmentAccess: true,
    mfaEnrolled: true,
  },
  tenant: {
    id: 'tenant-1',
    slug: 'test',
    plan: 'paid',
    sectors: ['financial', 'healthcare', 'it'],
    features: {
      sso: false,
      reviewDashboard: true,
      reports: true,
      fullAudit: true,
      departmentMapping: true,
      blockConcurrentLogin: true,
    },
    sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
  },
  sessionId: 'session-1',
};

async function ok(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data, meta: { requestId: 'admin-responsive' } }),
  });
}

async function prepareAdministrator(page: Page) {
  await page.context().addCookies([
    { name: 'rs_session', value: 'session-1', url: BASE_URL },
    { name: 'rs_role', value: 'administrator', url: BASE_URL },
  ]);
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/me') return ok(route, currentAdministrator);
    if (['/personas', '/scenarios', '/questions', '/rules', '/scoring-matrices', '/datasets', '/departments'].includes(path)) {
      return ok(route, []);
    }
    if (path === '/assessments') {
      const items = Array.from({ length: 30 }, (_, index) => ({
        _id: `assessment-${index}`,
        status: 'awaiting_decision',
        phase: 'result',
        personaKey: 'finance_officer',
        scenarioKey: 'fin_unauthorized_transaction',
        requestorId: `requestor-${index}`,
        requestor: { name: `Requestor ${index}`, email: `requestor-${index}@example.test` },
        department: { id: 'department-1', name: 'Finance' },
        result: { classification: 'risk', confidence: 55, mandatoryReview: true },
        decision: null,
        timing: { startedAt: '2026-10-29T08:00:00.000Z' },
        createdAt: '2026-10-29T08:00:00.000Z',
      }));
      return ok(route, {
        items,
        total: items.length,
        page: 1,
        limit: 25,
        pages: 2,
        counts: {
          in_progress: 0,
          intake_complete: 0,
          awaiting_decision: items.length,
          escalated: 0,
          closed: 0,
          error_review: 0,
          pending: items.length,
          all: items.length,
        },
        summary: { averageConfidence: 55 },
      });
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `No mock for ${path}` }, meta: { requestId: 'admin-responsive' } }),
    });
  });
}

test('every Administrator page reflows and keeps its scroll path reachable [DASH-02, DASH-03, DASH-04, NFR-08]', async ({ page }) => {
  await prepareAdministrator(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);

    for (const [path, heading] of ADMIN_ROUTES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('.page-shell')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('main').evaluate((main) => main.scrollWidth <= main.clientWidth + 1)).toBe(true);
    }

    await page.goto('/admin/review');
    if (viewport.width < 992) {
      await expect(page.getByTestId('admin-review-card').filter({ hasText: 'Requestor 0' }).first()).toBeVisible();
    } else {
      await expect(page.getByRole('row').filter({ hasText: 'Requestor 0' })).toBeVisible();
    }
    const scroll = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.page-shell');
      const table = document.querySelector<HTMLElement>('[data-slot="table-container"]');
      return {
        shell: Boolean(shell && shell.scrollHeight > shell.clientHeight + 1),
        table: Boolean(table && table.scrollHeight > table.clientHeight + 1),
      };
    });
    expect(scroll).toEqual(viewport.width < 992 ? { shell: true, table: false } : { shell: false, table: true });
  }
});

test('Administrator overview keeps its access guidance on one line at desktop widths [DASH-02, NFR-08]', async ({ page }) => {
  await prepareAdministrator(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/admin');

  const note = page.getByText('All configuration access routes through this audited workspace, never direct database or code access.', { exact: true });
  await expect(note).toBeVisible();
  expect(await note.evaluate((element) => element.getBoundingClientRect().height <= Number.parseFloat(getComputedStyle(element).lineHeight) + 1)).toBe(true);
});
