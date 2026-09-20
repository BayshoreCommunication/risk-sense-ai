import { expect, test, type Page, type Route } from '@playwright/test';
import { safeNextForRole } from '../lib/session';

const BASE_URL = 'http://127.0.0.1:3100';
type Role = 'requestor' | 'administrator' | 'system_administrator' | 'audit';
type Features = {
  sso: boolean;
  reviewDashboard: boolean;
  reports: boolean;
  fullAudit: boolean;
  departmentMapping: boolean;
  blockConcurrentLogin: boolean;
};

const defaultFeatures: Features = {
  sso: false,
  reviewDashboard: false,
  reports: false,
  fullAudit: false,
  departmentMapping: false,
  blockConcurrentLogin: false,
};

function currentUser(role: Role, featureOverrides: Partial<Features> = {}) {
  return {
    user: {
      id: 'user-1',
      firebaseUid: 'test:user-1',
      email: `${role}@example.test`,
      name: 'Test User',
      role,
      tenantId: 'tenant-1',
      departmentIds: [],
      crossDepartmentAccess: false,
      mfaEnrolled: true,
    },
    tenant: {
      id: 'tenant-1',
      slug: 'test',
      plan: role === 'requestor' && !featureOverrides.reports ? 'free' : 'paid',
      features: { ...defaultFeatures, ...featureOverrides },
      sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
    },
    sessionId: 'session-1',
  };
}

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'assessment-1',
    status: 'in_progress',
    phase: 'questions',
    personaKey: 'finance_officer',
    personaSource: 'user',
    personaCandidates: [],
    scenarioKey: 'wire_transfer',
    scenarioSource: 'ai',
    currentQuestionKey: 'amount',
    facts: [],
    result: null,
    decision: null,
    escalatedTo: null,
    timing: { startedAt: '2026-09-14T00:00:00.000Z' },
    createdAt: '2026-09-14T00:00:00.000Z',
    classifications: ['monitor_only', 'risk', 'elevated_risk', 'issue'],
    ...overrides,
  };
}

async function authenticate(page: Page, role: Role) {
  await page.context().addCookies([
    { name: 'rs_session', value: 'session-1', url: BASE_URL },
    { name: 'rs_role', value: role, url: BASE_URL },
  ]);
}

async function ok(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId: 'playwright' } }) });
}

async function apiError(route: Route, status: number, code: string, message: string) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message }, meta: { requestId: 'playwright' } }) });
}

type ApiRequest = { route: Route; path: string; method: string };
type ApiHandler = (request: ApiRequest) => boolean | Promise<boolean>;

async function mockApi(page: Page, getMe: () => ReturnType<typeof currentUser>, handler?: ApiHandler) {
  await page.route('**/test-api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/test-api/, '');
    if (path === '/me') {
      await ok(route, getMe());
      return;
    }
    if (handler && (await handler({ route, path, method: request.method() }))) return;
    await apiError(route, 404, 'NOT_FOUND', `No mock exists for ${request.method()} ${path}`);
  });
}

test('development authentication stays hidden unless explicitly enabled [SEC-01]', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Development sign-in (seeded accounts, no OTP)')).toHaveCount(0);
});

test('login session context follows the selected locale [SEC-02, NFR-08]', async ({ page }) => {
  await page.goto('/login?reason=session_expired');
  await expect(page.getByText('Your session expired. Sign in again to continue.')).toBeVisible();

  await page.getByRole('button', { name: 'বাংলা' }).click();
  await expect(page.getByText('আপনার সেশনের মেয়াদ শেষ হয়েছে। চালিয়ে যেতে আবার সাইন ইন করুন।')).toBeVisible();
  await expect(page.getByText('Your session expired. Sign in again to continue.')).toHaveCount(0);
});

test('post-login navigation stays same-origin and inside the verified role workspace [SEC-01, DASH-04]', () => {
  expect(safeNextForRole('/review?tab=closed#latest', 'requestor')).toBe('/review?tab=closed#latest');
  expect(safeNextForRole('/admin/analytics', 'requestor')).toBe('/chat');
  expect(safeNextForRole('https://attacker.example/admin', 'administrator')).toBe('/admin');
  expect(safeNextForRole('//attacker.example/audit', 'audit')).toBe('/audit/logs');
});

test('backend /me role replaces a stale role cookie before protected content renders [FR-02, SEC-01, DASH-04]', async ({ page }) => {
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path }) => {
    if (path === '/personas') {
      await ok(route, []);
      return true;
    }
    return false;
  });

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Persona and scenario selection' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administrator workspace' })).toHaveCount(0);

  const roleCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'rs_role');
  expect(roleCookie?.value).toBe('requestor');
});

for (const sessionFailure of [
  {
    label: 'expired',
    code: 'SESSION_EXPIRED',
    reason: 'session_expired',
    notice: 'Your session expired. Sign in again to continue.',
  },
  {
    label: 'invalid',
    code: 'SESSION_INVALID',
    reason: 'session_invalid',
    notice: 'Your session is no longer active. Sign in again to continue.',
  },
] as const) {
  test(`an ${sessionFailure.label} API session clears local hints and returns to login with context [SEC-02]`, async ({ page }) => {
    await authenticate(page, 'requestor');
    await mockApi(page, () => currentUser('requestor'), async ({ route, path }) => {
      if (path === '/personas') {
        await apiError(route, 401, sessionFailure.code, `session ${sessionFailure.label}`);
        return true;
      }
      return false;
    });

    await page.goto('/chat');
    await expect(page.getByText(sessionFailure.notice)).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('reason') === sessionFailure.reason && url.searchParams.get('next') === '/chat');

    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => ['rs_session', 'rs_role', 'rs_dev_user'].includes(cookie.name))).toBe(false);
  });
}

test('raw dataset downloads share the global invalid-session gate [SEC-02, FR-13]', async ({ page }) => {
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator'), async ({ route, path, method }) => {
    if (path === '/datasets' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/datasets/template' && method === 'GET') {
      await apiError(route, 401, 'SESSION_INVALID', 'session invalid');
      return true;
    }
    return false;
  });

  await page.goto('/admin/datasets');
  await page.getByRole('button', { name: 'Download template' }).click();
  await expect(page.getByText('Your session is no longer active. Sign in again to continue.')).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('reason') === 'session_invalid' && url.searchParams.get('next') === '/admin/datasets');
});

test('dataset history shows named provenance in a responsive evidence row [FR-14, NFR-07]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator'), async ({ route, path, method }) => {
    if (path === '/datasets' && method === 'GET') {
      await ok(route, [
        {
          _id: 'dataset-1',
          seq: 7,
          fileName: 'quarterly-risk-content.xlsx',
          format: 'xlsx',
          status: 'active',
          counts: { personas: 2, scenarios: 4, questions: 12, scoring: 6, skippedRows: 0 },
          validationErrors: [],
          authorId: 'author-id',
          reviewerId: 'reviewer-id',
          author: { id: 'author-id', name: 'Amina Uploader' },
          reviewer: { id: 'reviewer-id', name: 'Rafi Reviewer' },
          createdAt: '2026-09-14T08:30:00.000Z',
        },
      ]);
      return true;
    }
    return false;
  });

  await page.goto('/admin/datasets');
  const record = page.locator('main article').filter({ hasText: 'quarterly-risk-content.xlsx' });
  await expect(record.getByText('Amina Uploader')).toBeVisible();
  await expect(record.getByText('Rafi Reviewer')).toBeVisible();
  await expect(record.getByText(/^#7 · xlsx · Uploaded/)).toBeVisible();
  await expect(page.getByText('author-id')).toHaveCount(0);
  await expect(page.getByText('reviewer-id')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('dataset summary separates validation review from approved activation [FR-13, FR-14]', async ({ page }) => {
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator'), async ({ route, path, method }) => {
    if (path === '/datasets' && method === 'GET') {
      const dataset = (seq: number, status: 'active' | 'validated' | 'approved' | 'rejected') => ({
        _id: `dataset-${seq}`,
        seq,
        fileName: `content-${seq}.xlsx`,
        format: 'xlsx',
        status,
        counts: { personas: 1, scenarios: 1, questions: 1, scoring: 1, skippedRows: 0 },
        validationErrors: [],
        authorId: 'author-id',
        reviewerId: null,
        author: { id: 'author-id', name: 'Uploader' },
        reviewer: null,
        createdAt: '2026-09-14T08:30:00.000Z',
      });
      await ok(route, [dataset(1, 'active'), dataset(2, 'validated'), dataset(3, 'approved'), dataset(4, 'rejected')]);
      return true;
    }
    return false;
  });

  await page.goto('/admin/datasets');
  const summary = page.getByRole('region', { name: 'Dataset status summary' });
  await expect(summary.locator('[data-counter="review"] .metric-value')).toHaveText('1');
  await expect(summary.locator('[data-counter="activation"] .metric-value')).toHaveText('1');
});

test('administrator landing is useful and reports navigation follows /me features [DASH-02, DASH-03]', async ({ page }) => {
  let reports = false;
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator', { reports }));

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin configuration home' })).toBeVisible();
  await expect(page.locator('a[href="/admin/review"]').last()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveCount(0);

  reports = true;
  await page.reload();
  await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible();
});

test('administrator metrics keep successful live data distinct from unavailable sources [DASH-02]', async ({ page }) => {
  let recovered = false;
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator'), async ({ route, path, method }) => {
    if (method !== 'GET') return false;
    if (path === '/personas') {
      await ok(route, [
        { _id: 'persona-1', key: 'finance', status: 'active' },
        { _id: 'persona-2', key: 'legal', status: 'draft' },
      ]);
      return true;
    }
    if (['/scenarios', '/questions', '/rules', '/scoring-matrices', '/datasets'].includes(path)) {
      if (recovered) await ok(route, []);
      else await apiError(route, 503, 'UNAVAILABLE', `${path} unavailable`);
      return true;
    }
    return false;
  });

  await page.goto('/admin');
  const personaCard = page.locator('a[href="/admin/personas"]').last();
  const scenarioCard = page.locator('a[href="/admin/scenarios"]').last();
  await expect(personaCard.locator('[data-slot="card-title"]')).toHaveText('1');
  await expect(personaCard).toContainText('2 total records');
  await expect(scenarioCard.locator('[data-slot="card-title"]')).toHaveText('—');
  await expect(scenarioCard).toContainText('Current data is unavailable');
  const partialDataAlert = page.getByRole('alert').filter({ hasText: 'Some live data is unavailable' });
  await expect(partialDataAlert).toContainText('5 sources');

  recovered = true;
  await page.getByRole('button', { name: 'Retry unavailable data' }).click();
  await expect(partialDataAlert).toHaveCount(0);
  await expect(personaCard.locator('[data-slot="card-title"]')).toHaveText('1');
  await expect(scenarioCard.locator('[data-slot="card-title"]')).toHaveText('0');
});

test('direct standard reports access follows the authoritative tenant feature [FR-26, FR-28]', async ({ page }) => {
  let reports = false;
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator', { reports }));

  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Reports are not available' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Standard reports' })).toHaveCount(0);

  reports = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Standard reports' })).toBeVisible();
  // Each of the four FR-26 report panels exposes its own CSV and PDF export (FR-28).
  await expect(page.locator('#report-volume, #report-classification, #report-override, #report-time')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'CSV' })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'PDF' })).toHaveCount(4);
});

test('analytics supports pie, table and persistent period drill-down views [DASH-03, FR-27, FR-28]', async ({ page }) => {
  let failNextClassification = false;
  let drilldownUrl = '';
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator', { reports: true }), async ({ route, path, method }) => {
    if (method !== 'GET') return false;
    if (path === '/departments' || path === '/personas') {
      await ok(route, []);
      return true;
    }
    if (path === '/reports/volume') {
      await ok(route, {
        columns: [{ key: 'period', label: 'Period', kind: 'text' }, { key: 'started', label: 'Started', kind: 'number' }],
        rows: [{ period: '2026-08', started: 12 }],
        summary: { started: 12, closed: 8, escalated: 1 },
      });
      return true;
    }
    if (path === '/reports/classification') {
      if (failNextClassification) {
        failNextClassification = false;
        await apiError(route, 503, 'REPORT_UNAVAILABLE', 'Classification report is temporarily unavailable');
        return true;
      }
      await ok(route, {
        columns: [{ key: 'classification', label: 'Classification', kind: 'text' }, { key: 'count', label: 'Count', kind: 'number' }],
        rows: [
          { classification: 'monitor_only', count: 8, share: 67 },
          { classification: 'risk', count: 4, share: 33 },
          { classification: 'issue', count: 0, share: 0 },
        ],
        summary: { scored: 12, ruleDriven: 2, professionalConsult: 1 },
      });
      return true;
    }
    if (path === '/reports/override-rate') {
      await ok(route, {
        columns: [{ key: 'period', label: 'Period', kind: 'text' }, { key: 'overrideRate', label: 'Override rate', kind: 'percent' }],
        rows: [{ period: '2026-08', overrideRate: 25 }],
        summary: { overrideRate: 25, overridden: 2, accepted: 6 },
      });
      return true;
    }
    if (path === '/reports/assessment-time') {
      await ok(route, {
        columns: [{ key: 'period', label: 'Period', kind: 'text' }, { key: 'medianTotalSec', label: 'Median', kind: 'seconds' }],
        rows: [{ period: '2026-08', medianTotalSec: 180, p95TotalSec: 420 }],
        summary: { avgTotalSec: 240, medianTotalSec: 180, p95TotalSec: 420, avgIntakeSec: 120 },
      });
      return true;
    }
    if (path === '/assessments') {
      drilldownUrl = route.request().url();
      await ok(route, {
        items: [
          {
            _id: 'assessment-direct-risk',
            status: 'closed',
            phase: 'done',
            personaKey: 'finance_officer',
            scenarioKey: 'wire_transfer',
            requestorId: 'requestor-1',
            requestor: { name: 'Treasury analyst', email: 'treasury@example.test' },
            department: { name: 'Finance' },
            result: { classification: 'risk', confidence: 91 },
            decision: { type: 'accept', decidedAt: '2026-04-18T12:00:00.000Z' },
            timing: { startedAt: '2026-04-18T11:00:00.000Z' },
            createdAt: '2026-04-18T11:00:00.000Z',
          },
          {
            _id: 'assessment-overridden-risk',
            status: 'closed',
            phase: 'done',
            personaKey: 'it_support',
            scenarioKey: 'account_compromise',
            requestorId: 'requestor-2',
            requestor: { name: 'Security analyst', email: 'security@example.test' },
            department: { name: 'IT' },
            result: { classification: 'monitor_only', confidence: 84 },
            decision: { type: 'override', overriddenTo: 'risk', decidedAt: '2026-04-20T12:00:00.000Z' },
            timing: { startedAt: '2026-04-20T11:00:00.000Z' },
            createdAt: '2026-04-20T11:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 200,
        pages: 1,
        counts: { in_progress: 0, intake_complete: 0, awaiting_decision: 0, escalated: 0, closed: 2, error_review: 0, pending: 0, all: 2 },
        summary: { averageConfidence: 87.5 },
      });
      return true;
    }
    if (path === '/analytics/trends') {
      const by = new URL(route.request().url()).searchParams.get('by');
      if (by === 'classification') {
        // The monthly chart reads one period x classification call.
        const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
        await ok(route, {
          columns: [{ key: 'period', label: 'Period', kind: 'text' }, { key: 'group', label: 'Classification', kind: 'text' }, { key: 'count', label: 'Count', kind: 'number' }],
          rows: months.flatMap((period, index) => [
            { period, group: 'monitor_only', count: index + 4 },
            { period, group: 'risk', count: 2 },
            { period, group: 'elevated_risk', count: 1 },
            { period, group: 'issue', count: 0 },
          ]),
          summary: { by: 'classification', series: 'monitor_only|risk|elevated_risk|issue', total: 35 },
        });
        return true;
      }
      await ok(route, {
        columns: [{ key: 'period', label: 'Period', kind: 'text' }, { key: 'group', label: 'Group', kind: 'text' }, { key: 'count', label: 'Count', kind: 'number' }],
        rows: [{ period: '2026-08', group: 'Finance', count: 12 }],
        summary: { series: 'Finance' },
      });
      return true;
    }
    return false;
  });

  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics dashboard' })).toBeVisible();

  const monthlyPanel = page.locator('section.data-panel').filter({ has: page.getByRole('heading', { name: 'Monthly classification distribution', exact: true }) });
  const monthSelectors = monthlyPanel.getByRole('button', { name: /^Select / });
  await expect(monthSelectors).toHaveCount(5);
  await monthSelectors.first().click();
  await expect(monthSelectors.first()).toHaveAttribute('aria-pressed', 'true');
  const selectedMonthSummary = monthlyPanel.getByRole('group', { name: /classification totals$/ });
  const riskSummary = selectedMonthSummary.getByRole('button', { name: /^Risk in .*: 2$/ });
  await riskSummary.click();
  await expect(riskSummary).toHaveAttribute('aria-pressed', 'true');
  await expect(monthlyPanel.getByRole('row').filter({ hasText: 'Treasury analyst' })).toBeVisible();
  await expect(monthlyPanel.getByRole('row').filter({ hasText: 'Security analyst' })).toContainText('Risk');
  const drilldownQuery = new URL(drilldownUrl).searchParams;
  expect(drilldownQuery.get('classification')).toBeNull();
  expect(drilldownQuery.get('from')).toContain('2026-04-01');
  expect(drilldownQuery.get('to')).toContain('2026-04-30');
  const monthlyChart = monthlyPanel.getByRole('group', { name: 'Final classifications by month' });
  await expect(monthlyChart.getByRole('button', { name: / · Risk: 2$/ }).first()).toBeVisible();

  // Client comment 50: the same month data is self-selectable as a pie and as a table on this screen.
  await monthlyPanel.getByRole('button', { name: 'Pie', exact: true }).click();
  const monthlyPie = monthlyPanel.getByRole('group', { name: /classification distribution as a pie chart$/ });
  await expect(monthlyPie).toBeVisible();
  await expect(monthlyPanel.getByRole('button', { name: /Monitor Only 4/ })).toHaveCount(1);

  await monthlyPanel.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(monthlyPanel.getByRole('columnheader', { name: 'Month' })).toBeVisible();
  await expect(monthlyPanel.getByRole('columnheader', { name: 'Total' })).toBeVisible();
  await expect(monthlyPanel.getByRole('table').first().getByRole('row')).toHaveCount(6);

  await monthlyPanel.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(monthlyChart).toBeVisible();

  // The four report views, the FR-27 trend breakdown and the exports live on the standard reports screen.
  await page.goto('/admin/reports');
  // Figma parity: all four rows are compact by default; charts load only after the viewer expands one.
  await expect(page.getByRole('button', { name: 'Assessment volume', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Classification distribution', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Requestor override rates', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Average assessment time', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Chart', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /^Period/ }).click();
  await expect(page.getByLabel('Period', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Assessment volume', exact: true }).click();
  await page.getByRole('button', { name: '2026-08: 12' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2026-08' })).toContainText('12');

  await expect(page.locator('#report-volume')).toBeVisible();
  await expect(page.locator('#report-classification')).toBeVisible();
  await expect(page.locator('#report-override')).toBeVisible();
  await expect(page.locator('#report-time')).toBeVisible();

  const classificationPanel = page.locator('section.data-panel').filter({ has: page.getByRole('heading', { name: 'Classification distribution', exact: true }) });
  failNextClassification = true;
  await page.getByRole('button', { name: 'Classification distribution', exact: true }).click();
  await expect(classificationPanel.getByRole('alert')).toContainText('Classification report is temporarily unavailable');
  await expect(classificationPanel.getByText('Loading…')).toHaveCount(0);
  await classificationPanel.getByRole('button', { name: 'Retry' }).click();
  await classificationPanel.getByRole('button', { name: 'Pie' }).click();
  const pie = classificationPanel.getByRole('group', { name: 'Classification distribution as a pie chart' });
  await expect(pie).toBeVisible();
  await expect(pie.locator('path')).toHaveCount(2);
  const pieOption = classificationPanel.getByRole('button', { name: /Monitor Only 8/ });
  await expect(pieOption).toHaveCount(1);
  await pieOption.focus();
  await expect(pieOption).toBeFocused();
  await pieOption.press('Space');
  await expect(pieOption).toHaveAttribute('aria-pressed', 'true');

  await classificationPanel.getByRole('button', { name: 'Table' }).click();
  await expect(classificationPanel.getByRole('columnheader', { name: 'Classification' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('system navigation exposes every implemented operational workspace [DASH-04, FR-02, FR-10, NFR-06, FR-30]', async ({ page }) => {
  await authenticate(page, 'system_administrator');
  await mockApi(page, () => currentUser('system_administrator'), async ({ route, path }) => {
    if (path === '/system/retention/runs') {
      await ok(route, []);
      return true;
    }
    return false;
  });

  await page.goto('/system/retention');
  await expect(page.getByRole('heading', { name: 'Retention policy configuration' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'User & role provisioning', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Departments', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Disaster recovery', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conformance', exact: true })).toBeVisible();
});

test('assessment rows retain the scoped recommendation, explanation and recorded decision [DASH-01, FR-21]', async ({ page }) => {
  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/personas' && method === 'GET') {
      await ok(route, [{ key: 'finance_officer', name: 'Finance Officer' }]);
      return true;
    }
    if (path === '/departments' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/assessments' && method === 'GET') {
      await ok(route, {
        items: [{
          _id: '64b000000000000000000099',
          status: 'closed',
          phase: 'done',
          personaKey: 'finance_officer',
          scenarioKey: 'unauthorized_wire',
          requestorId: 'user-1',
          createdAt: '2026-09-15T08:00:00.000Z',
          timing: { startedAt: '2026-09-15T08:00:00.000Z', closedAt: '2026-09-15T08:10:00.000Z' },
          result: {
            score: 36,
            classification: 'risk',
            confidence: 94,
            ruleDriven: false,
            professionalConsult: false,
            mandatoryReview: false,
            recommendedAction: 'Manage the payment risk',
            explanation: 'The approval evidence is incomplete and requires owner follow-up.',
            computedAt: '2026-09-15T08:09:00.000Z',
          },
          decision: { type: 'accept', decidedAt: '2026-09-15T08:10:00.000Z' },
        }],
        total: 1,
        page: 1,
        limit: 25,
        pages: 1,
        counts: { in_progress: 0, intake_complete: 0, awaiting_decision: 0, escalated: 0, closed: 1, error_review: 0, pending: 0, all: 1 },
        summary: { averageConfidence: 94 },
      });
      return true;
    }
    return false;
  });

  await page.goto('/review');
  const row = page.getByRole('row').filter({ hasText: 'unauthorized wire' });
  await expect(row).toContainText('Manage the payment risk');
  await expect(row).toContainText('The approval evidence is incomplete and requires owner follow-up.');
  await expect(row).toContainText('accept');
});

test('mobile audit cards retain hash and human-decision evidence [FR-22, FR-26, SEC-07, NFR-08]', async ({ page }) => {
  const fullHash = 'ab'.repeat(32);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, 'audit');
  await mockApi(page, () => currentUser('audit', { reports: true, fullAudit: true }), async ({ route, path }) => {
    if (path === '/audit-logs') {
      await ok(route, {
        items: [{
          _id: 'event-1',
          seq: 42,
          category: 'decision',
          action: 'decision.recorded',
          actorRole: 'requestor',
          entity: { type: 'assessment', id: 'assessment-1' },
          payload: {},
          prevHash: '00'.repeat(32),
          hash: fullHash,
          createdAt: '2026-09-15T08:00:00.000Z',
        }],
        nextCursorSeq: null,
      });
      return true;
    }
    if (path === '/assessments') {
      await ok(route, {
        items: [{
          _id: 'assessment-1',
          status: 'closed',
          phase: 'done',
          personaKey: 'finance_officer',
          scenarioKey: 'fin_suspected_fraud',
          requestorId: 'requestor-1',
          requestor: { name: 'Finance reviewer', email: 'reviewer@example.test' },
          result: { classification: 'risk', confidence: 92 },
          decision: { type: 'accept', decidedAt: '2026-09-15T08:05:00.000Z' },
          timing: { startedAt: '2026-09-15T08:00:00.000Z' },
          createdAt: '2026-09-15T08:00:00.000Z',
        }],
        total: 1,
        page: 1,
        limit: 25,
        pages: 1,
        counts: { in_progress: 0, intake_complete: 0, awaiting_decision: 0, escalated: 0, closed: 1, error_review: 0, pending: 0, all: 1 },
      });
      return true;
    }
    return false;
  });

  await page.goto('/audit/logs');
  await expect(page.getByText(fullHash, { exact: true })).toBeVisible();
  await expect(page.getByText('Log size', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Text filters the 50 loaded entries. An exact 24-character record ID queries the audit log.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Filter loaded page or search exact record ID' }).fill('missing-user');
  await expect(page.getByText('No matches on this loaded page. Clear the filter or open Older entries.').first()).toBeVisible();

  await page.goto('/audit/assessments');
  await expect(page.getByText('Decision', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('accept', { exact: true }).first()).toBeVisible();
});

test('mobile workspace navigation traps focus and returns it to the trigger [NFR-07, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path }) => {
    if (path === '/personas') {
      await ok(route, []);
      return true;
    }
    return false;
  });

  await page.goto('/chat');
  const navigationTrigger = page.getByRole('button', { name: 'Open navigation' });
  await navigationTrigger.click();

  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  // The shell's top bar is the first <header> in the document; page headers render later, inside <main>.
  expect(await page.locator('header').first().evaluate((header) => Boolean(header.closest('[inert][aria-hidden="true"]')))).toBe(true);

  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(navigationTrigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a long chat transcript scrolls internally and keeps the composer visible [FR-06, NFR-07]', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await authenticate(page, 'requestor');
  const currentAssessment = assessment();
  const longMessages = Array.from({ length: 50 }, (_, index) => ({
    _id: `message-${index}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    kind: 'info',
    content: `Transcript entry ${index + 1}. This intentionally exercises a long, auditable assessment history.`,
    createdAt: '2026-09-14T00:00:00.000Z',
  }));
  longMessages.push({
    _id: 'message-question',
    role: 'assistant',
    kind: 'question',
    content: 'How much?',
    questionKey: 'amount',
    question: { key: 'amount', text: 'How much?', type: 'number', factKey: 'amount', required: true },
    createdAt: '2026-09-14T00:00:00.000Z',
  } as (typeof longMessages)[number]);

  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, longMessages);
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const composer = page.getByTestId('composer');
  await expect(composer).toBeVisible();
  const metrics = await page.evaluate(() => {
    const log = document.querySelector<HTMLElement>('[role="log"]');
    const scrollArea = log?.firstElementChild as HTMLElement | null;
    const composerElement = document.querySelector<HTMLElement>('[data-testid="composer"]');
    return {
      viewportHeight: window.innerHeight,
      bodyHeight: document.documentElement.scrollHeight,
      composerTop: composerElement?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      clientHeight: scrollArea?.clientHeight ?? 0,
      scrollHeight: scrollArea?.scrollHeight ?? 0,
    };
  });

  expect(metrics.composerTop).toBeLessThan(metrics.viewportHeight);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.bodyHeight).toBeLessThan(metrics.viewportHeight * 1.5);
});

test('pressing Enter on a number question sends a structured number [FR-06, NFR-01]', async ({ page }) => {
  let submitted: unknown;
  const numberQuestion = { key: 'amount', text: 'How much?', type: 'number', factKey: 'amount', required: true };
  const currentAssessment = assessment();
  const currentMessages = [
    {
      _id: 'message-1',
      role: 'assistant',
      kind: 'question',
      content: 'How much?',
      questionKey: 'amount',
      question: numberQuestion,
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'POST') {
      submitted = route.request().postDataJSON();
      await ok(route, currentAssessment);
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const input = page.getByPlaceholder('Enter a number');
  await input.fill('1250');
  await input.press('Enter');
  await expect.poll(() => submitted).toEqual({ value: 1250 });
});

test('the free-text composer sends each intended answer once and keeps newline or composition input local [FR-06, NFR-01]', async ({ page }) => {
  let postCount = 0;
  const submitted: unknown[] = [];
  const freeTextQuestion = { key: 'context', text: 'What happened?', type: 'free_text', factKey: 'context', required: true };
  const currentAssessment = assessment({ currentQuestionKey: 'context' });
  const currentMessages = [
    {
      _id: 'message-1',
      role: 'assistant',
      kind: 'question',
      content: 'What happened?',
      questionKey: 'context',
      question: freeTextQuestion,
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'POST') {
      postCount += 1;
      submitted.push(route.request().postDataJSON());
      // Keep the request in flight long enough to exercise the synchronous busy-ref guard.
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      await ok(route, currentAssessment);
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const composer = page.getByTestId('composer');
  const input = page.getByPlaceholder(/^Type your answer/);

  await input.fill('First line');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('First line\n');
  await page.waitForTimeout(50);
  expect(postCount).toBe(0);

  await input.fill('Still composing');
  await input.evaluate((element) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    if (!event.isComposing) throw new Error('The browser did not create a composing keyboard event');
    element.dispatchEvent(event);
  });
  await page.waitForTimeout(50);
  expect(postCount).toBe(0);

  await input.fill('Final answer');
  await input.evaluate((element) => {
    const enter = () => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    enter();
    enter();
  });
  await expect.poll(() => postCount).toBe(1);
  await expect(composer).toHaveAttribute('data-busy', 'false');
  expect(submitted).toEqual([{ text: 'Final answer' }]);

  await input.fill('Button answer');
  const send = composer.getByRole('button', { name: 'Send' });
  await send.evaluate((element) => {
    const click = () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    click();
  });
  await expect.poll(() => postCount).toBe(2);
  await expect(composer).toHaveAttribute('data-busy', 'false');
  expect(submitted).toEqual([{ text: 'Final answer' }, { text: 'Button answer' }]);
});

test('a low-confidence persona choice uses the explicit persona endpoint [FR-04]', async ({ page }) => {
  let submitted: unknown;
  const currentAssessment = assessment({ phase: 'persona', personaKey: undefined, personaSource: undefined, personaCandidates: ['finance_officer', 'it_support'], scenarioKey: undefined, currentQuestionKey: undefined });
  const currentMessages = [
    {
      _id: 'message-1',
      role: 'assistant',
      kind: 'question',
      content: 'Which of these roles best describes you?',
      question: {
        key: '__persona',
        type: 'mcq',
        options: [
          { id: 'finance_officer', label: 'Finance Officer' },
          { id: 'it_support', label: 'IT Support' },
        ],
      },
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/persona' && method === 'POST') {
      submitted = route.request().postDataJSON();
      await ok(route, assessment({ personaKey: 'it_support', personaSource: 'user' }));
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  await expect(page.getByText('Confirm the assessment persona')).toBeVisible();
  await page.getByTestId('persona-option').filter({ hasText: 'IT Support' }).click();
  await expect.poll(() => submitted).toEqual({ personaKey: 'it_support' });
});

test('a confident AI persona pauses for explicit confirmation without a next question [FR-04]', async ({ page }) => {
  let submitted: unknown;
  const currentAssessment = assessment({ phase: 'persona', personaSource: 'ai', personaCandidates: ['finance_officer', 'it_support'], scenarioKey: undefined, currentQuestionKey: undefined });
  const currentMessages = [
    {
      _id: 'message-1',
      role: 'assistant',
      kind: 'info',
      content: 'It sounds like you work as a Finance Officer.',
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/persona' && method === 'POST') {
      submitted = route.request().postDataJSON();
      await ok(route, assessment({ personaKey: 'finance_officer', personaSource: 'user' }));
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  await expect(page.getByText('Confirm the assessment persona')).toBeVisible();
  await page.getByRole('button', { name: 'Finance Officer (suggested)' }).click();
  await expect.poll(() => submitted).toEqual({ personaKey: 'finance_officer' });
});

test('a requestor can change a chosen persona before questions begin [FR-04]', async ({ page }) => {
  let submitted: unknown;
  const currentAssessment = assessment({ phase: 'describe', scenarioKey: undefined, currentQuestionKey: undefined });
  const currentMessages = [
    {
      _id: 'message-1',
      role: 'assistant',
      kind: 'question',
      content: 'Please describe what happened, in your own words.',
      question: { key: '__describe', type: 'free_text' },
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/personas' && method === 'GET') {
      await ok(route, [
        { key: 'finance_officer', name: 'Finance Officer', description: 'Finance', sector: 'financial' },
        { key: 'it_support', name: 'IT Support', description: 'Technology', sector: 'technology' },
      ]);
      return true;
    }
    if (path === '/assessments/assessment-1/persona' && method === 'POST') {
      submitted = route.request().postDataJSON();
      await ok(route, assessment({ personaKey: 'it_support', personaSource: 'user' }));
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  await page.getByRole('button', { name: 'Change persona' }).click();
  await page.getByTestId('persona-option').filter({ hasText: 'IT Support' }).click();
  await expect.poll(() => submitted).toEqual({ personaKey: 'it_support' });
});

test('a scoring weight change completes its approval lifecycle instead of stalling as an invisible draft [FR-18, FR-20, AI-05]', async ({ page }) => {
  await authenticate(page, 'administrator');

  const factors = (weights: Record<string, number>) =>
    Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, { weight, scale: { min: 1, max: 5 }, mapping: [] }]));
  const baseWeights = { controlEffectiveness: 20, impact: 20, severity: 20, likelihood: 15, duration: 10, regulatorySensitivity: 15 };
  const matrix = (overrides: Record<string, unknown>) => ({
    _id: 'm1',
    key: 'default',
    name: 'Default matrix',
    versionGroupId: 'group-1',
    version: 1,
    isCurrent: true,
    status: 'active',
    factors: factors(baseWeights),
    thresholds: { monitor_only: { min: 0, max: 25 }, risk: { min: 26, max: 50 }, elevated_risk: { min: 51, max: 75 }, issue: { min: 76, max: 100 } },
    confidence: { professionalConsultBelow: 60, mandatoryReviewBelow: 40 },
    ...overrides,
  });

  let versions: Record<string, unknown>[] = [matrix({})];
  let patched: Record<string, unknown> | null = null;

  await mockApi(page, () => currentUser('administrator'), async ({ route, path, method }) => {
    if (path === '/scoring-matrices' && method === 'GET') {
      // Mirror the server's filter: `view=current` hides drafts, which is what made a saved change look lost.
      const view = new URL(route.request().url()).searchParams.get('view');
      await ok(route, view === 'all' ? versions : versions.filter((v) => v.isCurrent && v.status === 'active'));
      return true;
    }
    // Copy-on-write: patching the live version yields a new draft, which is exactly why the screen has to
    // show that draft and be able to finish its lifecycle.
    if (path === '/scoring-matrices/m1' && method === 'PATCH') {
      patched = route.request().postDataJSON();
      const draft = matrix({ _id: 'm2', version: 2, isCurrent: false, status: 'draft', ...patched });
      versions = [versions[0]!, draft];
      await ok(route, draft);
      return true;
    }
    if (path === '/scoring-matrices/m2/approve' && method === 'POST') {
      versions = versions.map((v) => (v._id === 'm2' ? { ...v, approvedBy: 'user-2', changeRef: route.request().postDataJSON().changeRef } : v));
      await ok(route, versions.find((v) => v._id === 'm2'));
      return true;
    }
    if (path === '/scoring-matrices/m2/activate' && method === 'POST') {
      versions = versions.map((v) =>
        v._id === 'm2' ? { ...v, status: 'active', isCurrent: true } : { ...v, status: 'deactivated', isCurrent: false },
      );
      await ok(route, versions.find((v) => v._id === 'm2'));
      return true;
    }
    return false;
  });

  await page.goto('/admin/scoring');
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Scoring matrix - Default matrix' }) });
  await expect(panel.getByText('Version 2 is a draft')).toHaveCount(0);

  // Redistribute one point so the six weights still total 100 and the save is allowed.
  await panel.getByLabel('Impact', { exact: true }).press('ArrowRight');
  await panel.getByLabel('Severity', { exact: true }).press('ArrowLeft');
  await panel.getByRole('button', { name: 'Save configuration' }).click();

  await expect.poll(() => (patched as { factors?: Record<string, { weight: number }> } | null)?.factors?.impact?.weight).toBe(21);

  // The regression this test exists for: the saved draft stays on screen with its own weights, rather than
  // the list snapping back to the live version and losing the change silently.
  await expect(panel.getByText('Version 2 is a draft')).toBeVisible();
  await expect(panel.getByText('21%')).toBeVisible();
  await expect(panel.getByText('19%')).toBeVisible();

  await panel.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('change reference is required');
  await dialog.getByLabel('Change reference').fill('CHG-1042');
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();

  await expect(panel.getByText('This draft is approved.')).toBeVisible();
  await panel.getByRole('button', { name: 'Activate', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate', exact: true }).click();

  // Once activated the draft is gone and version 2 is what scores assessments.
  await expect(panel.getByText('Version 2 is a draft')).toHaveCount(0);
  await expect(panel.getByText('v2')).toBeVisible();
  await expect(panel.getByText('Active', { exact: true })).toBeVisible();
});
