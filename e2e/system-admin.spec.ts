import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

const me = {
  user: {
    id: '64b000000000000000000001',
    firebaseUid: 'test:system',
    email: 'system@example.test',
    name: 'System Admin',
    role: 'system_administrator',
    tenantId: '64b000000000000000000010',
    departmentIds: [],
    crossDepartmentAccess: false,
    mfaEnrolled: true,
  },
  tenant: {
    id: '64b000000000000000000010',
    slug: 'test',
    plan: 'paid',
    features: { sso: true, reviewDashboard: true, reports: true, fullAudit: true, departmentMapping: true, blockConcurrentLogin: false },
    sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
  },
  sessionId: 'session-1',
};

async function authenticate(page: Page) {
  await page.context().addCookies([
    { name: 'rs_session', value: 'session-1', url: BASE_URL },
    { name: 'rs_role', value: 'system_administrator', url: BASE_URL },
  ]);
}

async function ok(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId: 'system-playwright' } }) });
}

async function apiError(route: Route, status: number, code: string, message: string) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message }, meta: { requestId: 'system-playwright' } }) });
}

type ApiRequest = { route: Route; path: string; method: string; url: URL };
type ApiHandler = (request: ApiRequest) => boolean | Promise<boolean>;

async function mockApi(page: Page, handler?: ApiHandler) {
  await page.route('**/test-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/test-api/, '');
    if (path === '/me') {
      await ok(route, me);
      return;
    }
    if (handler && (await handler({ route, path, method: request.method(), url }))) return;
    await apiError(route, 404, 'NOT_FOUND', `No mock exists for ${request.method()} ${path}`);
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test('system landing exposes the complete operational workspace [DASH-04]', async ({ page }) => {
  await mockApi(page);
  await page.goto('/system');

  await expect(page.getByRole('heading', { name: 'System administration' })).toBeVisible();
  for (const name of ['Users', 'Departments', 'Tenant settings', 'Retention', 'Disaster recovery', 'Conformance']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name}`) }).last()).toBeVisible();
  }
});

test('a system administrator provisions a requestor with department scope [FR-02, FR-10]', async ({ page }) => {
  const financeId = '64b000000000000000000020';
  let posted: unknown;
  await mockApi(page, async ({ route, path, method }) => {
    if (path === '/system/users' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/system/departments' && method === 'GET') {
      await ok(route, [{ _id: financeId, name: 'Finance', personaIds: [] }]);
      return true;
    }
    if (path === '/system/users' && method === 'POST') {
      posted = route.request().postDataJSON();
      await ok(
        route,
        {
          _id: '64b000000000000000000030',
          email: 'reviewer@example.test',
          name: 'Finance Reviewer',
          role: 'requestor',
          departmentIds: [financeId],
          crossDepartmentAccess: true,
          mfaEnrolled: false,
          status: 'active',
          lastLoginAt: null,
        },
        201,
      );
      return true;
    }
    return false;
  });

  await page.goto('/system/users');
  await expect(page.getByText('No tenant users yet. Provision the first account.')).toBeVisible();
  await page.getByRole('button', { name: 'Provision user' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Finance Reviewer');
  await dialog.getByLabel('Work email').fill('reviewer@example.test');
  await dialog.getByLabel('Finance').check();
  await dialog.getByLabel('Allow review across every tenant department').check();
  await dialog.getByRole('button', { name: 'Provision user' }).click();

  await expect.poll(() => posted).toEqual({
    email: 'reviewer@example.test',
    name: 'Finance Reviewer',
    role: 'requestor',
    departmentIds: [financeId],
    crossDepartmentAccess: true,
  });
  await expect(page.getByText('Finance Reviewer')).toBeVisible();
  await expect(page.getByText('All departments')).toBeVisible();
});

test('role changes require confirmation and surface backend self-lockout protection [FR-02, SEC-02]', async ({ page }) => {
  let patchCount = 0;
  let patchBody: unknown;
  const user = {
    _id: '64b000000000000000000001',
    email: 'system@example.test',
    name: 'System Admin',
    role: 'system_administrator',
    departmentIds: [],
    crossDepartmentAccess: false,
    mfaEnrolled: true,
    status: 'active',
    lastLoginAt: '2026-09-14T08:00:00.000Z',
  };
  await mockApi(page, async ({ route, path, method }) => {
    if (path === '/system/users' && method === 'GET') {
      await ok(route, [user]);
      return true;
    }
    if (path === '/system/departments' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === `/system/users/${user._id}` && method === 'PATCH') {
      patchCount += 1;
      patchBody = route.request().postDataJSON();
      await apiError(route, 403, 'FORBIDDEN', 'You cannot demote or disable your current account');
      return true;
    }
    return false;
  });

  await page.goto('/system/users');
  await page.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role').selectOption('audit');
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  expect(patchCount).toBe(0);
  await expect(dialog.getByText('Confirm access change')).toBeVisible();
  await expect(dialog.getByText(/active sessions.*terminated/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm and save' }).click();

  await expect.poll(() => patchCount).toBe(1);
  expect(patchBody).toEqual({ role: 'audit' });
  await expect(dialog.getByText('You cannot demote or disable your current account', { exact: true })).toBeVisible();
});

test('department mapping uses the effective persona catalog and recovers from a duplicate-name error [FR-10]', async ({ page }) => {
  const personaId = '64b000000000000000000040';
  let attempts = 0;
  let lastBody: unknown;
  await mockApi(page, async ({ route, path, method }) => {
    if (path === '/system/departments' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/system/personas' && method === 'GET') {
      await ok(route, [{ _id: personaId, key: 'security_analyst', name: 'Security Analyst', sector: 'it', source: 'shared' }]);
      return true;
    }
    if (path === '/system/departments' && method === 'POST') {
      attempts += 1;
      lastBody = route.request().postDataJSON();
      if (attempts === 1) await apiError(route, 409, 'CONFLICT', 'A department with this name already exists');
      else await ok(route, { _id: '64b000000000000000000050', name: 'Operations', personaIds: [personaId] }, 201);
      return true;
    }
    return false;
  });

  await page.goto('/system/departments');
  await page.getByRole('button', { name: 'New department' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('it · shared content')).toBeVisible();
  await dialog.getByLabel('Department name').fill('Ops');
  await dialog.getByLabel('Security Analyst').check();
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await expect(dialog.getByRole('alert')).toContainText('A department with this name already exists');

  await dialog.getByLabel('Department name').fill('Operations');
  await dialog.getByRole('button', { name: 'Create department' }).click();
  await expect.poll(() => attempts).toBe(2);
  expect(lastBody).toEqual({ name: 'Operations', personaIds: [personaId] });
  await expect(page.getByRole('status')).toContainText('Operations mapping saved');
});

test('DR changes require an explicit external-evidence attestation [NFR-06, FR-25]', async ({ page }) => {
  const emptyStatus = {
    provider: null,
    backupsEnabled: false,
    lastBackupAt: null,
    lastRestoreDrillAt: null,
    lastRestoreDrillOutcome: null,
    evidenceRef: null,
    targets: { backupFrequencyHours: 24, rpoHours: 1, rtoHours: 4, drillFrequencyDays: 365 },
    checks: { backupFresh: false, drillCurrent: false, externalEvidenceRecorded: false },
    readiness: 'attention_required',
    updatedAt: null,
  };
  let patchBody: Record<string, unknown> | null = null;
  await mockApi(page, async ({ route, path, method }) => {
    if (path === '/system/dr/status' && method === 'GET') {
      await ok(route, emptyStatus);
      return true;
    }
    if (path === '/system/dr/status' && method === 'PATCH') {
      patchBody = route.request().postDataJSON();
      await ok(route, {
        ...emptyStatus,
        ...patchBody,
        checks: { backupFresh: true, drillCurrent: true, externalEvidenceRecorded: true },
        readiness: 'ready',
        updatedAt: '2026-09-14T10:35:00.000Z',
      });
      return true;
    }
    return false;
  });

  await page.goto('/system/dr');
  await expect(page.getByText('Operator-recorded evidence:')).toBeVisible();
  await page.getByLabel('Backup provider').fill('MongoDB Atlas');
  await page.getByLabel('Evidence URL').fill('https://example.test/evidence/backup-1');
  await page.getByLabel('Latest successful backup').fill('2026-09-14T10:30');
  await page.getByLabel('Latest restore drill').fill('2026-09-14T09:30');
  await page.getByLabel('Restore-drill outcome').selectOption('passed');
  await page.getByLabel('Backups are enabled at the external provider').check();

  const save = page.getByRole('button', { name: 'Save attested evidence' });
  await expect(save).toBeDisabled();
  await page.getByLabel(/I checked the external provider/).check();
  await expect(save).toBeEnabled();
  await save.click();

  await expect.poll(() => patchBody).not.toBeNull();
  expect(patchBody).toMatchObject({
    provider: 'MongoDB Atlas',
    backupsEnabled: true,
    lastRestoreDrillOutcome: 'passed',
    evidenceRef: 'https://example.test/evidence/backup-1',
  });
  await expect(page.getByText('Evidence ready')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Recovery evidence saved');
});

test('a tenant-wide conformance scan is confirmed and resolved history is opt-in [FR-30, AI-01, FR-08]', async ({ page }) => {
  const run = { tenantId: me.user.tenantId, slug: 'test', ranAt: '2026-09-14T10:00:00.000Z', trigger: 'manual', scanned: 4, valid: 3, flagged: 1, resolved: 0, durationMs: 18 };
  const openFlag = {
    _id: 'flag-1',
    assessmentId: '64b000000000000000000060',
    issues: [{ path: 'decision', message: 'AI-01: closed assessments require a human decision and deciding user' }],
    firstDetectedAt: '2026-09-14T10:00:00.000Z',
    lastDetectedAt: '2026-09-14T10:00:00.000Z',
  };
  let posts = 0;
  let includedResolved = false;
  await mockApi(page, async ({ route, path, method, url }) => {
    if (path === '/system/conformance/runs' && method === 'GET') {
      await ok(route, [run]);
      return true;
    }
    if (path === '/system/conformance/flags' && method === 'GET') {
      includedResolved ||= url.searchParams.get('includeResolved') === 'true';
      await ok(route, url.searchParams.get('includeResolved') === 'true' ? [{ ...openFlag, resolvedAt: '2026-09-14T10:05:00.000Z' }] : [openFlag]);
      return true;
    }
    if (path === '/system/conformance/run' && method === 'POST') {
      posts += 1;
      await ok(route, { ...run, ranAt: '2026-09-14T10:10:00.000Z', scanned: 5, valid: 3, flagged: 2, durationMs: 22 });
      return true;
    }
    return false;
  });

  await page.goto('/system/conformance');
  await expect(page.getByText('AI-01: closed assessments require a human decision and deciding user')).toBeVisible();
  await page.getByRole('button', { name: 'Run scan' }).click();
  expect(posts).toBe(0);
  await expect(page.getByText(/Scan every assessment/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm scan' }).click();
  await expect.poll(() => posts).toBe(1);
  await expect(page.locator('[data-slot="card"]').filter({ hasText: 'Flagged this run' })).toContainText('2');

  await page.getByLabel('Include resolved flags').check();
  await expect.poll(() => includedResolved).toBe(true);
  await expect(page.getByText('resolved', { exact: true })).toBeVisible();
});
