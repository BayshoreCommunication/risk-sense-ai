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
    if (path === '/datasets') {
      return ok(route, [{
        _id: 'dataset-1',
        seq: 1,
        fileName: 'starter-content.json',
        format: 'json',
        status: 'active',
        counts: { personas: 3, scenarios: 13, questions: 76, scoring: 6, skippedRows: 0 },
        validationErrors: [],
        authorId: 'admin-1',
        reviewerId: 'reviewer-1',
        author: { id: 'admin-1', name: 'Alex Morgan' },
        reviewer: { id: 'reviewer-1', name: 'Sarah Chen' },
        createdAt: '2026-09-16T12:00:09.000Z',
      }]);
    }
    if (['/personas', '/scenarios', '/questions', '/rules', '/scoring-matrices', '/departments'].includes(path)) {
      return ok(route, []);
    }
    if (path === '/analytics/trends') {
      return ok(route, {
        columns: [
          { key: 'period', label: 'Period', kind: 'text' },
          { key: 'group', label: 'Classification', kind: 'text' },
          { key: 'count', label: 'Count', kind: 'number' },
        ],
        rows: [
          { period: '2026-08', group: 'risk', count: 4 },
          { period: '2026-08', group: 'issue', count: 2 },
          { period: '2026-09', group: 'monitor_only', count: 2 },
          { period: '2026-09', group: 'elevated_risk', count: 3 },
        ],
        summary: {},
      });
    }
    if (path.startsWith('/reports/')) {
      const type = path.split('/').at(-1);
      const result = type === 'volume'
        ? { columns: [], rows: [], summary: { started: 12, closed: 8, escalated: 1 } }
        : type === 'classification'
          ? { columns: [], rows: [{ classification: 'risk', count: 3 }], summary: { scored: 3 } }
          : type === 'override-rate'
            ? { columns: [], rows: [], summary: { overrideRate: 12.5, overridden: 1, accepted: 7 } }
            : { columns: [], rows: [], summary: { avgTotalSec: 3600, p95TotalSec: 7200, avgIntakeSec: 600 } };
      return ok(route, result);
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
      await expect(page.locator('main')).not.toContainText(/\b(?:AI|DASH|FR|NFR|SEC)-\d/);
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

test('Analytics chart selection can be reset without changing its data window [DASH-03]', async ({ page }) => {
  await prepareAdministrator(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/analytics');

  const reset = page.getByRole('button', { name: 'Reset chart' });
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toBeDisabled();

  const month = page.getByRole('button', { name: /Select .+: \d+ scored assessments/ }).first();
  await month.click();
  await expect(reset).toBeEnabled();
  await expect(page.getByText('Last 5 complete months', { exact: true })).toBeVisible();
});

test('Dataset desktop columns keep content details inside their assigned cells [FR-13, FR-14, NFR-08]', async ({ page }) => {
  await prepareAdministrator(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/datasets');

  const fileCell = page.getByRole('cell').filter({ hasText: 'starter-content.json' });
  const rowsCell = page.getByRole('cell').filter({ hasText: 'Personas 3' });
  await expect(fileCell).toBeVisible();
  await expect(rowsCell).toBeVisible();

  const [fileBox, rowsBox] = await Promise.all([fileCell.boundingBox(), rowsCell.boundingBox()]);
  expect(fileBox).not.toBeNull();
  expect(rowsBox).not.toBeNull();
  expect(fileBox!.x + fileBox!.width).toBeLessThanOrEqual(rowsBox!.x + 1);
  expect(await rowsCell.evaluate((cell) => cell.scrollWidth <= cell.clientWidth + 1)).toBe(true);
});
