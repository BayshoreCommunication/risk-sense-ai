import { expect, test, type Page, type Route } from '@playwright/test';
import type { Message } from '../lib/assessments';
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
      sectors: ['financial', 'healthcare', 'it'],
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

test('English-only launch mode ignores a stale Bengali preference [SEC-02, NFR-08]', async ({ page }) => {
  await page.context().addCookies([{ name: 'rs_locale', value: 'bn', url: BASE_URL }]);
  await page.goto('/login?reason=session_expired');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Your session expired. Sign in again to continue.')).toBeVisible();
  await expect(page.getByTestId('language-indicator')).toContainText('English');
  await expect(page.getByText('বাংলা', { exact: true })).toHaveCount(0);

  const unsupportedLocale = await page.request.post('/api/locale', { data: { locale: 'bn' } });
  expect(unsupportedLocale.status()).toBe(400);
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

test('direct reports and analytics access follow the authoritative tenant feature [FR-26, FR-27, FR-28, DASH-03]', async ({ page }) => {
  let reports = false;
  let reportDataRequests = 0;
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator', { reports }), async ({ route, path }) => {
    if (path.startsWith('/reports/') || path === '/analytics/trends') {
      reportDataRequests += 1;
      await apiError(route, 403, 'FEATURE_DISABLED', 'Reports are disabled');
      return true;
    }
    return false;
  });

  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Reports are not available' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Standard reports' })).toHaveCount(0);

  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading', { name: 'Analytics are not available' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Analytics dashboard' })).toHaveCount(0);
  expect(reportDataRequests).toBe(0);

  reports = true;
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Standard reports' })).toBeVisible();
  // Each of the four FR-26 report panels exposes its own CSV and PDF export (FR-28).
  await expect(page.locator('#report-volume, #report-classification, #report-override, #report-time')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'CSV' })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'PDF' })).toHaveCount(4);
});

test('mandatory review queue remains scroll-contained and its table region is named [AI-03, FR-20, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 520 });
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator'), async ({ route, path }) => {
    if (path !== '/assessments') return false;
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
      timing: { startedAt: '2026-09-15T08:00:00.000Z' },
      createdAt: '2026-09-15T08:00:00.000Z',
    }));
    await ok(route, {
      items,
      total: items.length,
      page: 1,
      limit: 25,
      pages: 2,
      counts: { in_progress: 0, intake_complete: 0, awaiting_decision: items.length, escalated: 0, closed: 0, error_review: 0, pending: items.length, all: items.length },
      summary: { averageConfidence: 55 },
    });
    return true;
  });

  await page.goto('/admin/review');
  const shell = page.locator('.page-shell');
  await expect(shell).toBeVisible();
  expect(await shell.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await shell.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.getByRole('region', { name: 'Mandatory review queue' })).toBeVisible();
  const firstReviewRow = page.getByRole('row').filter({ hasText: 'Requestor 0' });
  await expect(firstReviewRow).toContainText('Finance Officer');
  await expect(firstReviewRow).toContainText('Financial Unauthorized Transaction');
  await expect(firstReviewRow).not.toContainText('finance_officer');
  await expect(firstReviewRow).not.toContainText('fin_unauthorized_transaction');
  await expect(firstReviewRow).not.toContainText('Fin Unauthorized Transaction');
});

test('named escalatee keeps requestor and department context without broad review scope [FR-21, FR-22, DASH-01]', async ({ page }) => {
  await authenticate(page, 'requestor');
  // Explicit escalation remains readable even if broad department review is later disabled.
  const me = currentUser('requestor', { reviewDashboard: false, reports: true });
  await mockApi(page, () => me, async ({ route, path }) => {
    if (path === '/personas' || path === '/departments') {
      await ok(route, []);
      return true;
    }
    if (path === '/assessments') {
      await ok(route, {
        items: [{
          _id: 'assessment-escalated',
          status: 'escalated',
          phase: 'result',
          personaKey: 'finance_officer',
          scenarioKey: 'wire_transfer',
          requestorId: 'original-owner',
          requestor: { name: 'Original Owner', email: 'owner@example.test' },
          department: { id: 'department-1', name: 'Finance' },
          result: {
            classification: 'risk',
            score: 48,
            confidence: 78,
            ruleDriven: false,
            professionalConsult: false,
            mandatoryReview: false,
            recommendedAction: 'Review the payment controls.',
            explanation: 'A named reviewer must complete the decision.',
          },
          decision: { type: 'escalate', decidedAt: '2026-09-15T08:05:00.000Z', reason: 'Named reviewer requested.' },
          escalatedTo: { id: me.user.id, name: me.user.name },
          timing: { startedAt: '2026-09-15T08:00:00.000Z' },
          createdAt: '2026-09-15T08:00:00.000Z',
        }],
        total: 1,
        page: 1,
        limit: 25,
        pages: 1,
        counts: { in_progress: 0, intake_complete: 0, awaiting_decision: 0, escalated: 1, closed: 0, error_review: 0, pending: 1, all: 1 },
        summary: { averageConfidence: 78 },
      });
      return true;
    }
    return false;
  });

  await page.goto('/review');
  await expect(page.getByRole('columnheader', { name: 'Requestor' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Department' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Original Owner' });
  await expect(row).toContainText('Finance');
  await expect(row).toContainText('Review the payment controls.');
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
  const treasuryRow = monthlyPanel.getByRole('row').filter({ hasText: 'Treasury analyst' });
  await expect(treasuryRow).toBeVisible();
  await expect(treasuryRow).toContainText('Finance Officer');
  await expect(treasuryRow).toContainText('Wire Transfer');
  await expect(treasuryRow).not.toContainText('finance_officer');
  await expect(treasuryRow).not.toContainText('wire_transfer');
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
  let requestedScenarioKey: string | null = null;
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
      requestedScenarioKey = new URL(route.request().url()).searchParams.get('scenarioKey');
      await ok(route, {
        items: [{
          _id: '64b000000000000000000099',
          status: 'closed',
          phase: 'done',
          personaKey: 'finance_officer',
          scenarioKey: 'fin_unauthorized_transaction',
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

  await page.goto('/review?scenarioKey=fin_unauthorized_transaction');
  await expect(page.getByLabel('Scenario', { exact: true })).toHaveValue('Financial Unauthorized Transaction');
  await expect(page.locator('#review-scenario-options option')).toHaveAttribute('value', 'Financial Unauthorized Transaction');
  expect(requestedScenarioKey).toBe('fin_unauthorized_transaction');
  const row = page.getByRole('row').filter({ hasText: 'Financial Unauthorized Transaction' });
  await expect(row).toContainText('Manage the payment risk');
  await expect(row).toContainText('The approval evidence is incomplete and requires owner follow-up.');
  await expect(row).toContainText('accept');
  await expect(row).not.toContainText('Fin Unauthorized Transaction');
  await expect(row).not.toContainText('fin_unauthorized_transaction');
});

test('audit payloads require confirmed unmask and reset immediately to the masked default [SEC-05, SEC-07]', async ({ page }) => {
  let unmaskCalls = 0;
  let maskedCalls = 0;
  await authenticate(page, 'audit');
  await mockApi(page, () => currentUser('audit', { fullAudit: true }), async ({ route, path }) => {
    if (path !== '/audit-logs') return false;
    const clear = new URL(route.request().url()).searchParams.get('unmask') === 'true';
    if (clear) unmaskCalls += 1;
    else maskedCalls += 1;
    await ok(route, {
      items: [{
        _id: 'event-sensitive',
        seq: 51,
        category: 'assessment',
        action: 'assessment.answer.recorded',
        actorRole: 'requestor',
        actorUserId: 'requestor-1',
        entity: { type: 'assessment', id: 'assessment-sensitive' },
        payload: { answer: clear ? 'account 1234' : '[MASKED:financial]' },
        payloadMasked: !clear,
        prevHash: '00'.repeat(32),
        hash: 'ab'.repeat(32),
        createdAt: '2026-09-15T08:00:00.000Z',
      }],
      nextCursorSeq: null,
    });
    return true;
  });

  await page.goto('/audit/logs');
  const auditTable = page.getByRole('region', { name: 'Audit log viewer' });
  const showPayload = () => page.getByRole('button', { name: 'Show payload for assessment.answer.recorded' });
  await showPayload().click();
  await expect(auditTable.locator('pre')).toContainText('[MASKED:financial]');
  await expect(auditTable).toBeVisible();

  await page.getByRole('button', { name: 'Unmask sensitive payloads' }).click();
  await expect(page.getByRole('dialog', { name: 'Show sensitive audit payloads?' })).toBeVisible();
  expect(unmaskCalls).toBe(0);
  await page.getByRole('button', { name: 'Confirm and unmask' }).click();
  await expect(page.getByText('Sensitive payloads are visible')).toBeVisible();
  await expect.poll(() => unmaskCalls).toBe(1);
  await showPayload().click();
  await expect(auditTable.locator('pre')).toContainText('account 1234');

  await page.getByRole('button', { name: 'Return to masked view' }).click();
  await expect(page.getByText('Sensitive payloads are visible')).toHaveCount(0);
  await expect.poll(() => maskedCalls).toBeGreaterThanOrEqual(2);
  await showPayload().click();
  await expect(auditTable.locator('pre')).toContainText('[MASKED:financial]');
  await expect(auditTable.locator('pre')).not.toContainText('account 1234');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Unmask sensitive payloads' })).toBeVisible();
  await expect(page.getByText('Sensitive payloads are visible')).toHaveCount(0);
});

test('a late unmasked audit response cannot overwrite a newer masked view [SEC-05, SEC-07]', async ({ page }) => {
  let unmaskCalls = 0;
  let releaseFirstUnmask!: () => void;
  let markFirstUnmaskStarted!: () => void;
  const firstUnmaskRelease = new Promise<void>((resolve) => { releaseFirstUnmask = resolve; });
  const firstUnmaskStarted = new Promise<void>((resolve) => { markFirstUnmaskStarted = resolve; });

  await authenticate(page, 'audit');
  await mockApi(page, () => currentUser('audit', { fullAudit: true }), async ({ route, path }) => {
    if (path !== '/audit-logs') return false;
    const clear = new URL(route.request().url()).searchParams.get('unmask') === 'true';
    if (clear) {
      unmaskCalls += 1;
      if (unmaskCalls === 1) {
        markFirstUnmaskStarted();
        await firstUnmaskRelease;
      }
    }
    await ok(route, {
      items: [{
        _id: 'event-race',
        seq: 52,
        category: 'assessment',
        action: 'assessment.answer.recorded',
        actorRole: 'requestor',
        actorUserId: 'requestor-1',
        entity: { type: 'assessment', id: 'assessment-race' },
        payload: { answer: clear ? `clear account ${unmaskCalls}` : '[MASKED:financial]' },
        payloadMasked: !clear,
        prevHash: '00'.repeat(32),
        hash: 'cd'.repeat(32),
        createdAt: '2026-09-15T08:00:00.000Z',
      }],
      nextCursorSeq: null,
    });
    return true;
  });

  await page.goto('/audit/logs');
  await page.getByRole('button', { name: 'Unmask sensitive payloads' }).click();
  await page.getByRole('button', { name: 'Confirm and unmask' }).click();
  await firstUnmaskStarted;

  // A server-side entity-id filter starts a second clear request while the first is still pending.
  await page.locator('#audit-search').fill('aaaaaaaaaaaaaaaaaaaaaaaa');
  await expect.poll(() => unmaskCalls).toBe(2);
  await page.getByRole('button', { name: 'Show payload for assessment.answer.recorded' }).click();
  const auditTable = page.getByRole('region', { name: 'Audit log viewer' });
  await expect(auditTable.locator('pre')).toContainText('clear account 2');

  await page.getByRole('button', { name: 'Return to masked view' }).click();
  await page.getByRole('button', { name: 'Show payload for assessment.answer.recorded' }).click();
  await expect(auditTable.locator('pre')).toContainText('[MASKED:financial]');

  releaseFirstUnmask();
  await expect(auditTable.locator('pre')).toContainText('[MASKED:financial]');
  await expect(auditTable.locator('pre')).not.toContainText('clear account');
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
  await expect(page.locator('article').filter({ hasText: 'Finance reviewer' })).toContainText('Financial Suspected Fraud');
  await expect(page.getByText('Fin Suspected Fraud', { exact: true })).toHaveCount(0);
  await expect(page.getByText('fin_suspected_fraud', { exact: true })).toHaveCount(0);
});

test('desktop sidebar collapse persists while mobile navigation stays labelled and focus-contained [DASH-04, NFR-07, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path }) => {
    if (path === '/personas') {
      await ok(route, []);
      return true;
    }
    return false;
  });

  await page.goto('/chat');
  const desktopNavigation = page.locator('#app-desktop-navigation');
  const main = page.locator('#main-content');
  const desktopRoleLabel = desktopNavigation.getByText('Requestor', { exact: true });
  await expect(desktopRoleLabel).not.toHaveClass(/sr-only/);
  await expect(desktopNavigation.getByText('New assessment', { exact: true })).toBeVisible();
  const expandedNavigationBox = await desktopNavigation.boundingBox();
  const expandedMainBox = await main.boundingBox();
  expect(expandedNavigationBox).not.toBeNull();
  expect(expandedMainBox).not.toBeNull();
  expect(expandedNavigationBox!.width).toBe(256);

  const accountMenu = page.getByTestId('account-menu');
  const accountMenuTrigger = accountMenu.locator('summary');
  await accountMenuTrigger.click();
  await expect(accountMenu).toHaveAttribute('open', '');
  await expect(accountMenu.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await accountMenu.getByText('requestor@example.test', { exact: true }).click();
  await expect(accountMenu).toHaveAttribute('open', '');
  await main.click({ position: { x: 12, y: 12 } });
  await expect(accountMenu).not.toHaveAttribute('open', '');
  await expect(accountMenu.getByRole('button', { name: 'Sign out' })).toBeHidden();

  const collapseNavigation = page.getByRole('button', { name: 'Collapse navigation' });
  await expect(collapseNavigation).toHaveAttribute('aria-expanded', 'true');
  await expect(collapseNavigation).toHaveAttribute('aria-controls', 'app-desktop-navigation');
  await expect(collapseNavigation).toHaveCSS('background-color', 'rgb(6, 29, 67)');
  await collapseNavigation.click();

  const expandNavigation = page.getByRole('button', { name: 'Expand navigation' });
  await expect(expandNavigation).toBeVisible();
  await expect(expandNavigation).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('rs_sidebar_collapsed'))).toBe('true');
  await expect(desktopRoleLabel).toHaveClass(/sr-only/);
  const compactChatLink = desktopNavigation.getByRole('link', { name: 'New assessment' });
  await expect(compactChatLink).toBeVisible();
  await expandNavigation.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(compactChatLink).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText('New assessment');
  await expect.poll(async () => (await desktopNavigation.boundingBox())?.width ?? 0).toBeLessThan(expandedNavigationBox!.width);
  const collapsedMainBox = await main.boundingBox();
  expect(collapsedMainBox).not.toBeNull();
  expect(collapsedMainBox!.x).toBeLessThan(expandedMainBox!.x);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect.poll(async () => (await desktopNavigation.boundingBox())?.width ?? 0).toBeLessThan(expandedNavigationBox!.width);
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await expect(page.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('rs_sidebar_collapsed'))).toBe('false');
  await expect(desktopRoleLabel).not.toHaveClass(/sr-only/);
  await expect(desktopNavigation.getByText('New assessment', { exact: true })).toBeVisible();
  await expect.poll(async () => (await desktopNavigation.boundingBox())?.width ?? 0).toBe(expandedNavigationBox!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.localStorage.setItem('rs_sidebar_collapsed', 'true'));
  await page.reload();
  const navigationTrigger = page.getByRole('button', { name: 'Open navigation' });
  await navigationTrigger.click();

  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Requestor', { exact: true })).toBeVisible();
  await expect(drawer.getByText('New assessment', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeHidden();
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

test('a long chat transcript stays viewport-contained with one transcript scroller and responsive context [FR-05, FR-06, FR-20, NFR-07, NFR-08]', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await authenticate(page, 'requestor');
  const scenarioKey = 'fin_unauthorized_transaction';
  const longTransactionToken = `TXN-${'A'.repeat(96)}`;
  const resultExplanation = 'The amount, bypassed controls, and active incident status make prompt professional review appropriate.';
  let submittedDecision: unknown;
  let releaseDecision: (() => void) | undefined;
  let assessmentState = assessment({ scenarioKey });
  const longMessages: Message[] = Array.from({ length: 50 }, (_, index) => ({
    _id: `message-${index}`,
    role: index % 2 === 0 ? 'assistant' : 'user',
    kind: 'info',
    content: `Transcript entry ${index + 1}. This intentionally exercises a long, auditable assessment history.`,
    createdAt: '2026-09-14T00:00:00.000Z',
  }));
  longMessages.push({
    _id: 'message-seeded-scenario',
    role: 'assistant',
    kind: 'info',
    content: 'Scenario: fin unauthorized transaction',
    createdAt: '2026-09-14T00:00:00.000Z',
  });
  longMessages.push({
    _id: 'message-evidence-file',
    role: 'assistant',
    kind: 'info',
    content: 'Evidence file: invoice_2024.pdf',
    createdAt: '2026-09-14T00:00:00.000Z',
  } as (typeof longMessages)[number]);
  longMessages.push({
    _id: 'message-long-token',
    role: 'user',
    kind: 'answer',
    content: longTransactionToken,
    createdAt: '2026-09-14T00:00:00.000Z',
  } as (typeof longMessages)[number]);
  longMessages.push({
    _id: 'message-question',
    role: 'assistant',
    kind: 'question',
    content: 'How much?',
    questionKey: 'amount',
    question: { key: 'amount', text: 'How much?', type: 'number', factKey: 'amount', required: true },
    createdAt: '2026-09-14T00:00:00.000Z',
  } as (typeof longMessages)[number]);
  let messageState = longMessages;

  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, assessmentState);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, messageState);
      return true;
    }
    if (path === '/assessments/assessment-1/decision' && method === 'POST') {
      submittedDecision = route.request().postDataJSON();
      await new Promise<void>((resolve) => {
        releaseDecision = resolve;
      });
      await ok(route, assessmentState);
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const composer = page.getByTestId('composer');
  await expect(composer).toBeVisible();
  await expect(page.getByText('Financial Unauthorized Transaction', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Scenario: Financial Unauthorized Transaction', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Evidence file: invoice_2024.pdf', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Fin Unauthorized Transaction', { exact: true })).toHaveCount(0);
  await expect(page.getByText(scenarioKey, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Selected scenario', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('current-stage-label')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#main-content');
    const shell = document.querySelector<HTMLElement>('[data-testid="assessment-conversation-page"]');
    const log = document.querySelector<HTMLElement>('[role="log"]');
    const scrollArea = log?.firstElementChild as HTMLElement | null;
    const composerElement = document.querySelector<HTMLElement>('[data-testid="composer"]');
    return {
      viewportHeight: window.innerHeight,
      bodyHeight: document.documentElement.scrollHeight,
      composerTop: composerElement?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      composerBottom: composerElement?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      shellClientHeight: shell?.clientHeight ?? 0,
      shellScrollHeight: shell?.scrollHeight ?? 0,
      clientHeight: scrollArea?.clientHeight ?? 0,
      scrollHeight: scrollArea?.scrollHeight ?? 0,
      mainScrollOwners: main
        ? Array.from(main.querySelectorAll<HTMLElement>('*')).filter((element) => {
            const overflowY = window.getComputedStyle(element).overflowY;
            return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1;
          }).length
        : 0,
    };
  });

  expect(metrics.composerTop).toBeLessThan(metrics.viewportHeight);
  expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.shellScrollHeight).toBeLessThanOrEqual(metrics.shellClientHeight + 1);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.mainScrollOwners).toBe(1);
  expect(metrics.bodyHeight).toBeLessThanOrEqual(metrics.viewportHeight);

  const contextDisclosure = page.getByTestId('assessment-context-disclosure');
  await expect(contextDisclosure).toBeVisible();
  await contextDisclosure.locator(':scope > summary').click();
  await expect(contextDisclosure).toHaveAttribute('open', '');
  await expect(contextDisclosure.getByRole('heading', { name: 'ASSESSMENT WORKFLOW' })).toBeVisible();
  await expect(contextDisclosure.getByText('Financial Unauthorized Transaction', { exact: true })).toBeVisible();
  await contextDisclosure.locator(':scope > summary').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeVisible();
  const longTokenBubble = page.getByText(longTransactionToken, { exact: true });
  await expect(longTokenBubble).toBeVisible();
  expect(await longTokenBubble.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  assessmentState = assessment({
    scenarioKey,
    status: 'awaiting_decision',
    phase: 'done',
    currentQuestionKey: undefined,
    facts: Array.from({ length: 16 }, (_, index) => ({
      key: index === 0 ? 'controls_bypassed' : index === 1 ? 'amount_usd' : `captured_fact_${index + 1}`,
      value: index === 0 ? true : index === 1 ? 125000 : index === 2 ? 'customer_funds' : index === 3 ? 'txn_abc123' : `Evidence value ${index + 1}`,
      source: index === 3 ? 'ai' as const : 'mcq' as const,
      questionKey: index === 2 ? 'fund_ownership' : index === 3 ? undefined : `question_${index + 1}`,
      confidence: 1,
      flagged: false,
    })),
    result: {
      score: 78,
      classification: 'elevated_risk',
      computedClassification: 'elevated_risk',
      ruleDriven: false,
      confidence: 92,
      professionalConsult: true,
      mandatoryReview: false,
      explanation: resultExplanation,
      keyDrivers: ['Controls Bypassed = true', 'Amount Usd > 100000', 'Reference Id = TXN_ABC123'],
      recommendedAction: 'Further Professional Risk Guidance Needed',
      nextSteps: ['Further Professional Risk Guidance Needed', 'Disclose/Report Issue'],
      factors: {
        control_effectiveness: { value: 5, weight: 15, contribution: 15, matchedMapping: 5 },
        regulatory_sensitivity: { value: 1, weight: 15, contribution: 0, matchedMapping: 1 },
      },
      computedAt: '2026-09-14T00:00:00.000Z',
    },
  });
  messageState = [
    ...longMessages.filter((message) => message._id !== 'message-long-token').slice(-3),
    {
      _id: 'message-fund-ownership',
      role: 'assistant',
      kind: 'question',
      content: 'Whose funds were involved?',
      questionKey: 'fund_ownership',
      question: {
        key: 'fund_ownership',
        text: 'Whose funds were involved?',
        type: 'mcq',
        factKey: 'fund_ownership',
        required: true,
        options: [{ id: 'customer_funds', label: 'Customer funds' }],
      },
      createdAt: '2026-09-14T00:00:00.500Z',
    },
    {
      _id: 'message-result-explanation',
      role: 'assistant',
      kind: 'result',
      content: resultExplanation,
      createdAt: '2026-09-14T00:00:01.000Z',
    },
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Assessment result' })).toBeVisible();
  await expect(page.getByRole('img', { name: '78 / 100 risk score' })).toBeVisible();
  await expect(page.getByText('Why this result', { exact: true })).toBeVisible();
  await expect(page.getByText(resultExplanation, { exact: true })).toHaveCount(1);
  await expect(page.getByText('Recommended action', { exact: true })).toBeVisible();
  await expect(page.getByText('Further Professional Risk Guidance Needed', { exact: true })).toHaveCount(1);
  const controlsBypassedDriver = page.locator('li').filter({ hasText: 'Controls Bypassed' });
  await expect(controlsBypassedDriver.getByText('Controls Bypassed', { exact: true })).toBeVisible();
  await expect(controlsBypassedDriver.getByText('Yes', { exact: true })).toBeVisible();
  const referenceDriver = page.locator('li').filter({ hasText: 'Reference ID' });
  await expect(referenceDriver.getByText('TXN_ABC123', { exact: true })).toBeVisible();
  await expect(page.getByText('Txn Abc123', { exact: true })).toHaveCount(0);
  const amountDriver = page.locator('li').filter({ hasText: 'Amount USD' });
  await expect(amountDriver.getByText('Above 100000', { exact: true })).toBeVisible();
  await expect(page.getByText('Controls Bypassed = true', { exact: true })).toHaveCount(0);
  await page.getByText('Factor breakdown', { exact: true }).click();
  await expect(page.getByText('Control Effectiveness', { exact: true })).toBeVisible();
  await expect(page.getByText('Regulatory Sensitivity', { exact: true })).toBeVisible();
  await expect(page.getByTestId('assessment-result').getByText('Contribution', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept recommendation' })).toBeVisible();
  await expect(page.getByTestId('composer')).toHaveCount(0);
  await expect(page.getByTestId('current-stage-label')).toBeHidden();
  const contextAside = page.getByRole('complementary', { name: 'Assessment context' });
  await expect(contextAside).toBeVisible();
  await expect(contextAside.getByTestId('workflow-progress')).toHaveText('5/5');
  await expect(contextAside.getByText('Financial Unauthorized Transaction', { exact: true })).toBeVisible();
  await contextAside.locator('details').locator(':scope > summary').click();
  const compactFactRows = contextAside.getByTestId('context-fact-row');
  await expect(compactFactRows).toHaveCount(16);
  await expect(contextAside.getByText('Customer funds', { exact: true })).toBeVisible();
  await expect(contextAside.getByText('customer_funds', { exact: true })).toHaveCount(0);
  await expect(contextAside.getByText('txn_abc123', { exact: true })).toBeVisible();
  const factRowHeights = await compactFactRows.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(Math.max(...factRowHeights)).toBeLessThanOrEqual(50);
  const contextAsideBox = await contextAside.boundingBox();
  expect(contextAsideBox).not.toBeNull();
  expect(contextAsideBox!.width).toBeLessThanOrEqual(285);
  await page.getByRole('button', { name: 'Override…' }).click();
  const overrideClassification = page.getByRole('combobox', { name: 'Override classification' });
  await overrideClassification.click();
  await page.getByRole('option', { name: 'Elevated Risk', exact: true }).click();
  await expect(overrideClassification).toContainText('Elevated Risk');
  await expect(overrideClassification).not.toContainText('elevated_risk');
  await page.getByRole('button', { name: 'Override…' }).click();
  await contextAside.locator('details').locator(':scope > summary').click();
  const resultMetrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="assessment-conversation-page"]');
    const result = document.querySelector<HTMLElement>('[data-testid="assessment-result"]');
    const context = document.querySelector<HTMLElement>('aside[aria-label="Assessment context"]');
    const main = document.querySelector<HTMLElement>('#main-content');
    return {
      shellClientHeight: shell?.clientHeight ?? 0,
      shellScrollHeight: shell?.scrollHeight ?? 0,
      resultBottom: result?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      viewportHeight: window.innerHeight,
      contextClientHeight: context?.clientHeight ?? 0,
      contextScrollHeight: context?.scrollHeight ?? 0,
      scrollOwners: main
        ? Array.from(main.querySelectorAll<HTMLElement>('*')).filter((element) => {
            const overflowY = window.getComputedStyle(element).overflowY;
            return (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1;
          }).length
        : 0,
    };
  });
  expect(resultMetrics.shellScrollHeight).toBeLessThanOrEqual(resultMetrics.shellClientHeight + 1);
  expect(resultMetrics.resultBottom).toBeLessThanOrEqual(resultMetrics.viewportHeight);
  expect(resultMetrics.contextScrollHeight).toBeLessThanOrEqual(resultMetrics.contextClientHeight + 1);
  expect(resultMetrics.scrollOwners).toBeLessThanOrEqual(1);

  const acceptDecision = page.getByRole('button', { name: 'Accept recommendation' });
  await acceptDecision.click();
  await expect.poll(() => submittedDecision).toEqual({ type: 'accept' });
  await expect(page.getByRole('button', { name: 'Recording your decision…' })).toBeVisible();
  releaseDecision?.();
  await expect(acceptDecision).toBeVisible();
});

test('the active MCQ is an accessible inline assistant approval card in a fluid conversation shell [FR-06, DASH-04, NFR-07, NFR-08]', async ({ page }) => {
  let postCount = 0;
  let submitted: unknown;
  let answered = false;
  let releaseAnswer: (() => void) | undefined;
  const activeQuestion = {
    key: 'fund_ownership',
    text: 'Whose funds were involved?',
    type: 'mcq',
    factKey: 'fund_ownership',
    required: true,
    options: [
      { id: 'customer_funds', label: 'Customer funds' },
      { id: 'company_funds', label: 'Company funds' },
      { id: 'both', label: 'Both' },
    ],
  } as const;
  const nextQuestion = { key: 'context', text: 'What happened next?', type: 'free_text', factKey: 'context', required: true } as const;
  const currentAssessment = assessment({ currentQuestionKey: activeQuestion.key });
  const answeredAssessment = assessment({ currentQuestionKey: nextQuestion.key });
  const currentMessages = [
    {
      _id: 'message-historical-question',
      role: 'assistant',
      kind: 'question',
      content: 'Which region was affected?',
      questionKey: 'affected_region',
      question: {
        key: 'affected_region',
        text: 'Which region was affected?',
        type: 'mcq',
        factKey: 'affected_region',
        required: true,
        options: [
          { id: 'domestic', label: 'Domestic' },
          { id: 'international', label: 'International' },
        ],
      },
      createdAt: '2026-09-14T00:00:00.000Z',
    },
    {
      _id: 'message-historical-answer',
      role: 'user',
      kind: 'answer',
      content: 'Domestic',
      createdAt: '2026-09-14T00:00:01.000Z',
    },
    {
      _id: 'message-active-question',
      role: 'assistant',
      kind: 'question',
      content: activeQuestion.text,
      questionKey: activeQuestion.key,
      question: activeQuestion,
      createdAt: '2026-09-14T00:00:02.000Z',
    },
  ];
  const answeredMessages = [
    ...currentMessages,
    {
      _id: 'message-committed-answer',
      role: 'user',
      kind: 'answer',
      content: 'Customer funds',
      createdAt: '2026-09-14T00:00:03.000Z',
    },
    {
      _id: 'message-next-question',
      role: 'assistant',
      kind: 'question',
      content: nextQuestion.text,
      questionKey: nextQuestion.key,
      question: nextQuestion,
      createdAt: '2026-09-14T00:00:04.000Z',
    },
  ];

  await page.setViewportSize({ width: 1760, height: 900 });
  await authenticate(page, 'requestor');
  await mockApi(page, () => currentUser('requestor'), async ({ route, path, method }) => {
    if (path === '/assessments/assessment-1' && method === 'GET') {
      await ok(route, answered ? answeredAssessment : currentAssessment);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'GET') {
      await ok(route, answered ? answeredMessages : currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'POST') {
      postCount += 1;
      submitted = route.request().postDataJSON();
      answered = true;
      await new Promise<void>((resolve) => {
        releaseAnswer = resolve;
      });
      await ok(route, { ...answeredAssessment, nextQuestion });
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const conversation = page.getByTestId('conversation-log');
  const historicalAssistant = conversation.locator('.is-assistant').filter({ hasText: 'Which region was affected?' });
  const activeAssistant = conversation.locator('.is-assistant').filter({ hasText: activeQuestion.text }).last();
  const inlineCard = activeAssistant.getByRole('group', { name: activeQuestion.text });
  const composer = page.getByTestId('composer');

  await expect(historicalAssistant.getByTestId('inline-choice-card')).toHaveCount(0);
  await expect(inlineCard).toBeVisible();
  await expect(inlineCard).toHaveAttribute('data-testid', 'inline-choice-card');
  await expect(inlineCard).toHaveAttribute('aria-busy', 'false');
  await expect(composer).toBeVisible();
  await expect(composer.getByPlaceholder('Choose the best match')).toBeDisabled();
  await expect(composer.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(composer.getByTestId('answer-option')).toHaveCount(0);
  await expect(page.getByTestId('answer-option')).toHaveCount(3);
  const activeAssistantBox = await activeAssistant.boundingBox();
  expect(activeAssistantBox).not.toBeNull();
  expect(activeAssistantBox!.width).toBeGreaterThan(850);

  const workspace = page.getByRole('region', { name: 'Assessment conversation workspace' });
  const expandedWorkspaceBox = await workspace.boundingBox();
  expect(expandedWorkspaceBox).not.toBeNull();
  await page.getByRole('button', { name: 'Collapse navigation' }).click();
  await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  await expect.poll(async () => Math.round((await workspace.boundingBox())?.width ?? 0)).toBeGreaterThan(Math.round(expandedWorkspaceBox!.width + 120));
  const collapsedWorkspaceBox = await workspace.boundingBox();
  expect(collapsedWorkspaceBox).not.toBeNull();
  expect(collapsedWorkspaceBox!.x).toBeLessThan(expandedWorkspaceBox!.x - 120);

  const customerFunds = inlineCard.getByRole('button', { name: 'Customer funds', exact: true });
  const companyFunds = inlineCard.getByRole('button', { name: 'Company funds', exact: true });
  await customerFunds.focus();
  await expect(customerFunds).toBeFocused();
  await expect(customerFunds).toHaveAttribute('data-selected', 'false');

  await customerFunds.evaluate((element) => {
    const click = () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    click();
  });

  await expect.poll(() => postCount).toBe(1);
  expect(submitted).toEqual({ value: 'customer_funds' });
  await expect(inlineCard).toHaveAttribute('aria-busy', 'true');
  await expect(customerFunds).toHaveAttribute('data-selected', 'true');
  await expect(customerFunds).toBeDisabled();
  await expect(companyFunds).toBeDisabled();
  await expect(page.getByTestId('optimistic-answer')).toContainText('Customer funds');
  await expect(page.getByTestId('assistant-processing')).toBeVisible();

  releaseAnswer?.();
  await expect(conversation.getByText(nextQuestion.text, { exact: true })).toBeVisible();
  await expect(page.getByTestId('optimistic-answer')).toHaveCount(0);
  expect(postCount).toBe(1);
});

test('the active yes/no question keeps inline binary choices above an optional explanation composer [FR-06, NFR-07, NFR-08]', async ({ page }) => {
  let postCount = 0;
  let failExplanation = true;
  let releaseBinaryAnswer: (() => void) | undefined;
  const submitted: unknown[] = [];
  const activeQuestion = {
    key: 'controls_bypassed',
    text: 'Were approval controls bypassed?',
    type: 'yes_no',
    factKey: 'controls_bypassed',
    required: true,
  } as const;
  const currentAssessment = assessment({ currentQuestionKey: activeQuestion.key });
  const currentMessages = [
    {
      _id: 'message-active-yes-no-question',
      role: 'assistant',
      kind: 'question',
      content: activeQuestion.text,
      questionKey: activeQuestion.key,
      question: activeQuestion,
      createdAt: '2026-09-14T00:00:00.000Z',
    },
  ];

  await page.setViewportSize({ width: 1280, height: 800 });
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
      const body = route.request().postDataJSON();
      submitted.push(body);
      if (failExplanation && typeof body === 'object' && body !== null && 'text' in body) {
        failExplanation = false;
        await apiError(route, 500, 'TEMPORARY_FAILURE', 'Please try again.');
        return true;
      }
      await new Promise<void>((resolve) => {
        releaseBinaryAnswer = resolve;
      });
      await ok(route, currentAssessment);
      return true;
    }
    return false;
  });

  await page.goto('/chat/assessment-1');
  const conversation = page.getByTestId('conversation-log');
  const activeAssistant = conversation.locator('.is-assistant').filter({ hasText: activeQuestion.text }).last();
  const inlineCard = activeAssistant.getByTestId('inline-choice-card');
  const binaryOptions = inlineCard.getByTestId('binary-answer-option');
  const composer = page.getByTestId('composer');
  const explanation = composer.getByPlaceholder('or explain in words…');
  const send = composer.getByRole('button', { name: 'Send' });

  await expect(inlineCard).toBeVisible();
  await expect(inlineCard).toHaveAttribute('aria-busy', 'false');
  await expect(binaryOptions).toHaveCount(2);
  await expect(inlineCard.getByText('Choose Yes or No', { exact: true })).toBeVisible();
  await expect(inlineCard.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await expect(inlineCard.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  await expect(composer.getByTestId('binary-answer-option')).toHaveCount(0);
  await expect(composer.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0);
  await expect(composer.getByRole('button', { name: 'No', exact: true })).toHaveCount(0);
  await expect(page.getByText('Or add a short explanation', { exact: true })).toHaveCount(0);
  await expect(explanation).toBeEnabled();
  await expect(explanation).toHaveAccessibleName('Explain your answer');
  const [inlineCardBox, composerBox] = await Promise.all([inlineCard.boundingBox(), composer.boundingBox()]);
  expect(inlineCardBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(inlineCardBox!.y + inlineCardBox!.height).toBeLessThanOrEqual(composerBox!.y + 1);

  await explanation.fill('The approver was unavailable.');
  await expect(send).toBeEnabled();
  await send.click();
  await expect.poll(() => postCount).toBe(1);
  expect(submitted).toEqual([{ text: 'The approver was unavailable.' }]);
  await expect(composer).toHaveAttribute('data-busy', 'false');
  await expect(explanation).toHaveValue('The approver was unavailable.');
  await expect(inlineCard.getByRole('alert')).toContainText('Please try again.');

  const noOption = inlineCard.getByRole('button', { name: 'No', exact: true });
  const yesOption = inlineCard.getByRole('button', { name: 'Yes', exact: true });
  await expect(noOption).toHaveAttribute('aria-pressed', 'false');
  await noOption.evaluate((element) => {
    const click = () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    click();
  });

  await expect.poll(() => postCount).toBe(2);
  expect(submitted).toEqual([{ text: 'The approver was unavailable.' }, { value: false }]);
  await expect(inlineCard).toHaveAttribute('aria-busy', 'true');
  await expect(noOption).toHaveAttribute('data-selected', 'true');
  await expect(noOption).toHaveAttribute('aria-pressed', 'true');
  await expect(noOption).toBeDisabled();
  await expect(yesOption).toBeDisabled();
  await expect(composer).toHaveAttribute('data-busy', 'true');
  await expect(explanation).toBeDisabled();
  await expect(page.getByTestId('optimistic-answer')).toContainText('No');
  await expect(page.getByTestId('assistant-processing')).toBeVisible();

  releaseBinaryAnswer?.();
  await expect(composer).toHaveAttribute('data-busy', 'false');
  await expect(explanation).toBeEnabled();
  await expect(explanation).toHaveValue('');
  await expect(page.getByTestId('optimistic-answer')).toHaveCount(0);
  expect(postCount).toBe(2);
  expect(submitted.filter((body) => JSON.stringify(body) === JSON.stringify({ value: false }))).toHaveLength(1);
});

test('pressing Enter on a number question sends a structured number [FR-06, NFR-07]', async ({ page }) => {
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

test('the free-text composer echoes one intended answer, reports processing, and restores failed drafts [FR-06, NFR-07]', async ({ page }) => {
  let postCount = 0;
  let failNext = false;
  let failNextTranscriptRefresh = false;
  const submitted: unknown[] = [];
  const pendingResponses: Array<() => void> = [];
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
      if (failNextTranscriptRefresh) {
        failNextTranscriptRefresh = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'TEMPORARY_REFRESH', message: 'Refresh failed.' } }),
        });
        return true;
      }
      await ok(route, currentMessages);
      return true;
    }
    if (path === '/assessments/assessment-1/messages' && method === 'POST') {
      postCount += 1;
      const submittedAnswer = route.request().postDataJSON();
      submitted.push(submittedAnswer);
      if (failNext) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'Please try again.' } }),
        });
        return true;
      }
      // Hold the response so the optimistic bubble and meaningful assistant status can be asserted.
      await new Promise<void>((resolve) => pendingResponses.push(resolve));
      await ok(
        route,
        submittedAnswer?.text === 'Committed once'
          ? {
              ...currentAssessment,
              currentQuestionKey: 'details',
              nextQuestion: { key: 'details', text: 'What happened next?', type: 'free_text', factKey: 'details', required: true },
            }
          : currentAssessment,
      );
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
  await expect(page.getByTestId('optimistic-answer')).toContainText('Final answer');
  await expect(page.getByTestId('assistant-processing')).toContainText('Understanding your answer and preparing the next question…');
  await expect(input).toHaveValue('');
  pendingResponses.shift()?.();
  await expect(composer).toHaveAttribute('data-busy', 'false');
  await expect(page.getByTestId('optimistic-answer')).toHaveCount(0);
  expect(submitted).toEqual([{ text: 'Final answer' }]);

  await input.fill('Button answer');
  const send = composer.getByRole('button', { name: 'Send' });
  await send.evaluate((element) => {
    const click = () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    click();
    click();
  });
  await expect.poll(() => postCount).toBe(2);
  await expect(page.getByTestId('optimistic-answer')).toContainText('Button answer');
  pendingResponses.shift()?.();
  await expect(composer).toHaveAttribute('data-busy', 'false');
  expect(submitted).toEqual([{ text: 'Final answer' }, { text: 'Button answer' }]);

  failNext = true;
  await input.fill('Keep this draft');
  await send.click();
  await expect.poll(() => postCount).toBe(3);
  await expect(composer).toHaveAttribute('data-busy', 'false');
  await expect(input).toHaveValue('Keep this draft');
  await expect(composer.getByRole('alert')).toContainText('Please try again.');

  failNext = false;
  failNextTranscriptRefresh = true;
  await input.fill('Committed once');
  await send.click();
  await expect.poll(() => postCount).toBe(4);
  await expect(page.getByTestId('optimistic-answer')).toContainText('Committed once');
  pendingResponses.shift()?.();
  await expect(composer).toHaveAttribute('data-busy', 'false');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('optimistic-answer')).toHaveCount(0);
  await expect(page.getByText('Committed once', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('conversation-log').getByText('What happened next?', { exact: true })).toBeVisible();
  await expect(composer.getByRole('alert')).toContainText('Your action was saved, but the latest conversation could not be refreshed.');

  await input.fill('A different follow-up');
  await send.click();
  await expect.poll(() => postCount).toBe(5);
  expect(submitted.at(-1)).toEqual({ text: 'A different follow-up' });
  pendingResponses.shift()?.();
  await expect(composer).toHaveAttribute('data-busy', 'false');
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
  const suggestedPersona = page.getByRole('button', { name: 'Finance Officer (suggested)' });
  await expect(suggestedPersona).toBeVisible();
  await expect(suggestedPersona).toHaveClass(/text-foreground/);
  await suggestedPersona.click();
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
