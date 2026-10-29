import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';
const CAPTURE_OUTPUT = '/Users/bayshorecommunication/Desktop/RiskSenseAi/docs/audits/2026-10-29-audit-responsive';
const captureScreenshots = process.env.CAPTURE_AUDIT_SCREENSHOTS === '1';

const me = {
  user: {
    id: '64b000000000000000000001', firebaseUid: 'test:audit', email: 'audit@example.test',
    name: 'Audit Reviewer', role: 'audit', tenantId: '64b000000000000000000010', departmentIds: [],
    crossDepartmentAccess: false, mfaEnrolled: true,
  },
  tenant: {
    id: '64b000000000000000000010', slug: 'test', plan: 'paid', sectors: ['financial', 'healthcare', 'it'],
    features: { sso: true, reviewDashboard: true, reports: true, fullAudit: true, departmentMapping: true, blockConcurrentLogin: false },
    sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
  },
  sessionId: 'session-audit', accessMode: 'standard',
};

async function authenticate(page: Page) {
  await page.context().addCookies([
    { name: 'rs_session', value: 'session-audit', url: BASE_URL },
    { name: 'rs_role', value: 'audit', url: BASE_URL },
  ]);
}

async function ok(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId: 'audit-responsive' } }) });
}

async function mockApi(page: Page) {
  await page.route('**/test-api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/test-api/, '');
    if (path === '/me') return ok(route, me);
    if (path === '/audit-logs') {
      return ok(route, {
        items: Array.from({ length: 50 }, (_, index) => ({
          _id: `event-${index + 1}`, seq: 550 - index, category: ['auth', 'assessment', 'decision', 'config'][index % 4],
          action: `audit.event.${index + 1}`, actorRole: index % 4 === 0 ? 'system_administrator' : 'requestor',
          actorUserId: `64b000000000000000000${String(index).padStart(3, '0')}`,
          entity: { type: index % 2 === 0 ? 'assessment' : 'session', id: `64b000000000000000001${String(index).padStart(3, '0')}` },
          payload: { result: '[MASKED:financial]' }, payloadMasked: true,
          prevHash: '00'.repeat(32), hash: 'ab'.repeat(32), createdAt: '2026-10-29T08:00:00.000Z',
        })),
        nextCursorSeq: 500,
      });
    }
    if (path === '/assessments') {
      const items = Array.from({ length: 25 }, (_, index) => ({
        _id: `assessment-${index + 1}`, status: index % 3 === 0 ? 'closed' : 'awaiting_decision', phase: 'done',
        personaKey: index % 2 === 0 ? 'finance_officer' : 'it_support',
        scenarioKey: index % 2 === 0 ? 'fin_unauthorized_transaction' : 'it_data_exposure',
        requestorId: `requestor-${index + 1}`,
        requestor: { name: `Evidence Owner ${index + 1}`, email: `owner-${index + 1}@example.test` },
        department: { name: index % 2 === 0 ? 'Financial Crime & Treasury Compliance' : 'Information Security & Cyber Defense' },
        result: { classification: index % 3 === 0 ? 'risk' : 'elevated_risk', confidence: 88 + (index % 8) },
        decision: index % 3 === 0 ? { type: 'accept', decidedAt: '2026-10-29T08:05:00.000Z' } : null,
        timing: { startedAt: '2026-10-29T08:00:00.000Z' }, createdAt: '2026-10-29T08:00:00.000Z',
      }));
      return ok(route, {
        items, total: 125, page: 1, limit: 25, pages: 5,
        counts: { in_progress: 8, intake_complete: 4, awaiting_decision: 45, escalated: 9, closed: 59, error_review: 0, pending: 54, all: 125 },
        summary: { averageConfidence: 91.4 },
      });
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: path } }) });
  });
}

async function pageLayout(page: Page, tableSelector: string) {
  return page.evaluate((selector) => {
    const shell = document.querySelector<HTMLElement>('.page-shell');
    const panel = document.querySelector<HTMLElement>(selector);
    const table = panel?.querySelector<HTMLElement>('[data-slot="table-container"]') ?? null;
    const visible = Boolean(panel && panel.getClientRects().length > 0);
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      shellScrolls: Boolean(shell && shell.scrollHeight > shell.clientHeight + 1),
      tableVisible: visible,
      tableScrolls: Boolean(visible && table && table.scrollHeight > table.clientHeight + 1),
    };
  }, tableSelector);
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockApi(page);
});

test('audit logs keep one vertical scroll owner across phone, tablet, laptop, and desktop [SEC-07, NFR-08]', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 780 }, { width: 768, height: 820 }, { width: 1024, height: 768 }, { width: 1440, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/audit/logs');
    await expect(page.getByRole('heading', { name: 'Audit log viewer' })).toBeVisible();
    await expect(page.getByText('audit.event.50')).toHaveCount(3);

    const layout = await pageLayout(page, '.audit-logs-panel');
    expect(layout.documentOverflow).toBe(false);
    if (viewport.width < 1200) {
      expect(layout).toMatchObject({ shellScrolls: true, tableVisible: false, tableScrolls: false });
    } else {
      expect(layout).toMatchObject({ shellScrolls: false, tableVisible: true, tableScrolls: true });
    }
    if (captureScreenshots && viewport.width === 390) {
      await page.screenshot({ path: `${CAPTURE_OUTPUT}/implementation-audit-logs-mobile.png`, fullPage: false });
    }
    if (captureScreenshots && viewport.width === 1440) {
      await page.screenshot({ path: `${CAPTURE_OUTPUT}/implementation-audit-logs-desktop.png`, fullPage: false });
    }
  }
});

test('audit assessments preserve evidence and scrolling across phone, tablet, laptop, and desktop [FR-26, NFR-08]', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 780 }, { width: 768, height: 820 }, { width: 1024, height: 768 }, { width: 1440, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/audit/assessments');
    await expect(page.getByRole('heading', { name: 'Assessments (audit view)' })).toBeVisible();
    await expect(page.getByText('Evidence Owner 25')).toHaveCount(2);

    const layout = await pageLayout(page, '.audit-assessments-panel');
    expect(layout.documentOverflow).toBe(false);
    if (viewport.width < 1200) {
      expect(layout).toMatchObject({ shellScrolls: true, tableVisible: false, tableScrolls: false });
    } else {
      expect(layout).toMatchObject({ shellScrolls: false, tableVisible: true, tableScrolls: true });
    }
    if (captureScreenshots && viewport.width === 1440) {
      await page.screenshot({ path: `${CAPTURE_OUTPUT}/implementation-audit-assessments-desktop.png`, fullPage: false });
    }
  }
});
