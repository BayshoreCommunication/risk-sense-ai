import { expect, test, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:3100';

function currentAdministrator() {
  return {
    user: {
      id: 'admin-1',
      firebaseUid: 'test:admin-1',
      email: 'administrator@example.test',
      name: 'Content Administrator',
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
}

async function authenticate(page: Page) {
  await page.context().addCookies([
    { name: 'rs_session', value: 'session-1', url: BASE_URL },
    { name: 'rs_role', value: 'administrator', url: BASE_URL },
  ]);
}

async function ok(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, meta: { requestId: 'content-manager-test' } }) });
}

type Handler = (route: Route, path: string, method: string) => Promise<boolean> | boolean;

async function mockApi(page: Page, handler: Handler) {
  await page.route('**/test-api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/test-api/, '');
    if (path === '/me') {
      await ok(route, currentAdministrator());
      return;
    }
    if (await handler(route, path, request.method())) return;
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: `No mock for ${request.method()} ${path}` }, meta: { requestId: 'content-manager-test' } }),
    });
  });
}

test('scenario flow and recommendations are authored with structured controls [FR-07, FR-11, DASH-02]', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/scenarios' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/scenarios' && method === 'POST') {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await ok(route, { _id: 'scenario-1', ...submitted, status: 'draft', version: 1 }, 201);
      return true;
    }
    return false;
  });

  await page.goto('/admin/scenarios');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Key *', { exact: true }).fill('finance_wire_risk');
  await page.getByLabel('Persona key *', { exact: true }).fill('finance_officer');
  await page.getByLabel('Name *', { exact: true }).fill('Unexpected wire transfer');
  await page.getByLabel('Description *', { exact: true }).fill('Investigate an unexpected high-value wire transfer.');
  await page.getByLabel('Business context *', { exact: true }).fill('Treasury payment operations');

  const flow = page.getByTestId('structured-flow');
  await flow.getByRole('button', { name: 'Add question' }).click();
  await flow.getByLabel('Question key').fill('finance_wire_authorized');
  await flow.getByLabel('Question 1 visibility').click();
  await page.getByRole('option', { name: 'Only when a fact matches' }).click();
  await flow.getByLabel('Fact key to check').fill('wire_pending');
  await flow.getByLabel('Must equal value type').click();
  await page.getByRole('option', { name: 'True / false' }).click();

  const actions = page.getByTestId('structured-actions');
  const riskAction = actions.getByRole('group', { name: 'Risk', exact: true });
  await riskAction.getByRole('button', { name: 'Configure action' }).click();
  await riskAction.getByLabel('Decision recommendation').fill('Manage the risk');
  await riskAction.getByRole('button', { name: 'Add entry' }).click();
  await riskAction.getByLabel('Next steps 1').fill('Contact the treasury owner');

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect.poll(() => submitted).toMatchObject({
    key: 'finance_wire_risk',
    personaKey: 'finance_officer',
    conversationFlow: [{ questionKey: 'finance_wire_authorized', showIf: { factKey: 'wire_pending', equals: true } }],
    recommendedActions: { risk: { decisionRecommendation: 'Manage the risk', nextSteps: ['Contact the treasury owner'] } },
  });
});

test('question choices and branch triggers validate and preserve scalar types [FR-06, FR-07, FR-15, DASH-02]', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  let postCount = 0;
  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/questions' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/questions' && method === 'POST') {
      postCount += 1;
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await ok(route, { _id: 'question-1', ...submitted, status: 'active' }, 201);
      return true;
    }
    return false;
  });

  await page.goto('/admin/questions');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Key *', { exact: true }).fill('wire_state');
  await page.getByLabel('Question text *', { exact: true }).fill('What is the current wire state?');
  await page.getByLabel('Type *', { exact: true }).click();
  await page.getByRole('option', { name: 'mcq' }).click();
  await page.getByLabel('Fact key *', { exact: true }).fill('wire_state');
  await page.getByLabel('Persona keys *', { exact: true }).fill('finance_officer');
  await page.getByLabel('Sectors *', { exact: true }).fill('financial');

  const options = page.getByTestId('structured-options');
  await options.getByRole('button', { name: 'Add choice' }).click();
  const firstChoice = options.getByRole('group', { name: 'Choice 1' });
  await firstChoice.getByLabel('Choice ID').fill('open');
  await firstChoice.getByLabel('User-facing label').fill('Still open');
  await firstChoice.getByLabel('Stored fact value', { exact: true }).fill('open');

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Multiple-choice questions need at least two choices');
  expect(postCount).toBe(0);

  await options.getByRole('button', { name: 'Add choice' }).click();
  const secondChoice = options.getByRole('group', { name: 'Choice 2' });
  await secondChoice.getByLabel('Choice ID').fill('resolved');
  await secondChoice.getByLabel('User-facing label').fill('Resolved');
  await secondChoice.getByLabel('Stored fact value', { exact: true }).fill('resolved');

  const branch = page.getByTestId('structured-branch');
  await branch.getByRole('button', { name: 'Add branch trigger' }).click();
  await branch.getByLabel('Follow-up question keys 1').fill('wire_resolution_detail');

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect.poll(() => submitted).toMatchObject({
    type: 'mcq',
    options: [
      { id: 'open', label: 'Still open', factValue: 'open' },
      { id: 'resolved', label: 'Resolved', factValue: 'resolved' },
    ],
    branchTrigger: { onValue: true, questionKeys: ['wire_resolution_detail'] },
  });
});

test('rule condition builder emits the deterministic condition language [FR-16, FR-17, AI-05]', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/rules' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/rules' && method === 'POST') {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await ok(route, { _id: 'rule-1', ...submitted, status: 'draft', version: 1, isCurrent: false }, 201);
      return true;
    }
    return false;
  });

  await page.goto('/admin/rules');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Key *', { exact: true }).fill('large_unauthorized_wire');
  await page.getByLabel('Name *', { exact: true }).fill('Large unauthorized wire');
  const condition = page.getByTestId('structured-condition');
  await condition.getByLabel('Condition type').click();
  await page.getByRole('option', { name: 'All conditions (AND)' }).click();
  const nodes = condition.getByTestId('condition-node');
  await nodes.nth(1).getByLabel('Fact key').fill('authorized');
  await nodes.nth(1).getByLabel('Comparison value value type').click();
  await page.getByRole('option', { name: 'True / false' }).click();
  await nodes.nth(1).getByLabel('Comparison value', { exact: true }).click();
  await page.getByRole('option', { name: 'False' }).click();
  await nodes.nth(0).getByRole('button', { name: 'Add condition' }).click();
  await nodes.nth(2).getByLabel('Fact key').fill('amount_usd');
  await nodes.nth(2).getByLabel('Condition operator').click();
  await page.getByRole('option', { name: 'Greater than', exact: true }).click();
  await nodes.nth(2).getByLabel('Comparison value value type').click();
  await page.getByRole('option', { name: 'Number' }).click();
  await nodes.nth(2).getByLabel('Comparison value', { exact: true }).fill('100000');
  await page.getByLabel('Forced classification *', { exact: true }).click();
  await page.getByRole('option', { name: 'Issue', exact: true }).click();

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect.poll(() => submitted).toMatchObject({
    trigger: {
      all: [
        { factKey: 'authorized', op: 'eq', value: false },
        { factKey: 'amount_usd', op: 'gt', value: 100000 },
      ],
    },
    forcedClassification: 'issue',
  });
});

test('matrix factors, mappings, thresholds and confidence use structured controls [FR-18, FR-19, FR-20]', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/scoring-matrices' && method === 'GET') {
      await ok(route, []);
      return true;
    }
    if (path === '/scoring-matrices' && method === 'POST') {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await ok(route, { _id: 'matrix-1', ...submitted, status: 'draft', version: 1, isCurrent: false }, 201);
      return true;
    }
    return false;
  });

  await page.goto('/admin/scoring');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Key *', { exact: true }).fill('default');
  await page.getByLabel('Name *', { exact: true }).fill('Default matrix');
  await expect(page.getByText('Total factor weight: 100% (valid)')).toBeVisible();

  const impact = page.getByTestId('structured-factors').getByRole('group', { name: 'Impact' });
  await impact.getByLabel('Fact key').fill('loss_amount_usd');
  await impact.getByLabel('Comparison value value type').click();
  await page.getByRole('option', { name: 'Number' }).click();
  await impact.getByLabel('Comparison value', { exact: true }).fill('250000');
  await page.getByLabel('Professional consultation below (%)').fill('65');
  await page.getByLabel('Mandatory review below (%)').fill('45');

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect.poll(() => submitted).toMatchObject({
    factors: {
      impact: {
        weight: 25,
        scale: { min: 1, max: 5 },
        mapping: [{ when: { factKey: 'loss_amount_usd', op: 'gt', value: 250000 }, value: 5 }],
      },
    },
    thresholds: {
      monitor_only: { min: 0, max: 25 },
      risk: { min: 26, max: 50 },
      elevated_risk: { min: 51, max: 75 },
      issue: { min: 76, max: 100 },
    },
    confidence: { professionalConsultBelow: 65, mandatoryReviewBelow: 45 },
  });
});

test('every lifecycle transition waits for an explicit confirmation [AI-05, AI-06, DASH-02]', async ({ page }) => {
  const calls: string[] = [];
  let approvalBody: unknown;
  const rules = [
    { _id: 'rule-draft', key: 'draft_rule', name: 'Draft rule', priority: 10, forcedClassification: 'risk', status: 'draft', version: 2, isCurrent: false },
    {
      _id: 'rule-active',
      key: 'active_rule',
      name: 'Active rule',
      priority: 20,
      trigger: {
        all: [
          { factKey: 'authorized', op: 'eq', value: false },
          { any: [{ factKey: 'amount_usd', op: 'gt', value: 100000 }, { factKey: 'regulator_notified', op: 'exists' }] },
        ],
      },
      forcedClassification: 'issue',
      status: 'active',
      version: 1,
      isCurrent: true,
    },
  ];
  const scenarios = [
    { _id: 'scenario-draft', key: 'draft_scenario', personaKey: 'finance_officer', name: 'Draft scenario', conversationFlow: [], status: 'draft', version: 2, isCurrent: false },
    { _id: 'scenario-active', key: 'active_scenario', personaKey: 'finance_officer', name: 'Active scenario', conversationFlow: [], status: 'active', version: 1, isCurrent: true },
  ];

  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/rules' && method === 'GET') {
      await ok(route, rules);
      return true;
    }
    if (path === '/scenarios' && method === 'GET') {
      await ok(route, scenarios);
      return true;
    }
    if (method === 'POST' && ['/rules/rule-draft/approve', '/rules/rule-active/retire', '/scenarios/scenario-draft/activate', '/scenarios/scenario-active/deactivate'].includes(path)) {
      calls.push(path);
      if (path === '/rules/rule-draft/approve') approvalBody = route.request().postDataJSON();
      await ok(route, {});
      return true;
    }
    return false;
  });

  await page.goto('/admin/rules');
  const draftRule = page.locator('article').filter({ hasText: 'Draft rule' });
  await draftRule.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm approve' })).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(calls).toEqual([]);
  await draftRule.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Confirm Approve' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a change reference before approving.');
  expect(calls).toEqual([]);
  await page.getByLabel('Change reference').fill('CHG-2026-1042');
  await page.getByRole('button', { name: 'Confirm Approve' }).click();
  await expect.poll(() => calls).toContain('/rules/rule-draft/approve');
  expect(approvalBody).toEqual({ changeRef: 'CHG-2026-1042' });

  const activeRule = page.locator('article').filter({ hasText: 'Active rule' });
  await expect(activeRule).toContainText('(authorized = false AND (amount_usd > 100000 OR regulator_notified exists))');
  await activeRule.getByRole('button', { name: 'Retire' }).click();
  expect(calls).not.toContain('/rules/rule-active/retire');
  await page.getByRole('button', { name: 'Confirm Retire' }).click();
  await expect.poll(() => calls).toContain('/rules/rule-active/retire');

  await page.goto('/admin/scenarios');
  const draftScenario = page.getByRole('row').filter({ hasText: 'draft_scenario' });
  await draftScenario.getByRole('button', { name: 'Activate' }).click();
  expect(calls).not.toContain('/scenarios/scenario-draft/activate');
  await page.getByRole('button', { name: 'Confirm Activate' }).click();
  await expect.poll(() => calls).toContain('/scenarios/scenario-draft/activate');

  const activeScenario = page.getByRole('row').filter({ hasText: 'active_scenario' });
  await activeScenario.getByRole('button', { name: 'Deactivate' }).click();
  expect(calls).not.toContain('/scenarios/scenario-active/deactivate');
  await page.getByRole('button', { name: 'Confirm Deactivate' }).click();
  await expect.poll(() => calls).toContain('/scenarios/scenario-active/deactivate');
});

test('failed lifecycle transition stays open and succeeds on retry [AI-05, AI-06, DASH-02]', async ({ page }) => {
  let approvalAttempts = 0;
  const approvalBodies: unknown[] = [];
  const rules = [
    { _id: 'rule-draft', key: 'draft_rule', name: 'Draft rule', priority: 10, forcedClassification: 'risk', status: 'draft', version: 2, isCurrent: false },
  ];

  await authenticate(page);
  await mockApi(page, async (route, path, method) => {
    if (path === '/rules' && method === 'GET') {
      await ok(route, rules);
      return true;
    }
    if (path === '/rules/rule-draft/approve' && method === 'POST') {
      approvalAttempts += 1;
      approvalBodies.push(route.request().postDataJSON());
      if (approvalAttempts === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'CONFLICT', message: 'Rule changed since review. Retry after checking the latest version.' },
            meta: { requestId: 'content-manager-conflict' },
          }),
        });
      } else {
        await ok(route, {});
      }
      return true;
    }
    return false;
  });

  await page.goto('/admin/rules');
  await page.locator('article').filter({ hasText: 'Draft rule' }).getByRole('button', { name: 'Approve' }).click();

  const confirmation = page.getByRole('dialog', { name: 'Confirm approve' });
  const changeReference = confirmation.getByLabel('Change reference');
  await changeReference.fill('CHG-2026-409');
  await confirmation.getByRole('button', { name: 'Confirm Approve' }).click();

  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('alert')).toContainText('Rule changed since review. Retry after checking the latest version.');
  await expect(changeReference).toHaveValue('CHG-2026-409');
  expect(approvalAttempts).toBe(1);

  await confirmation.getByRole('button', { name: 'Confirm Approve' }).click();
  await expect(confirmation).toBeHidden();
  expect(approvalAttempts).toBe(2);
  expect(approvalBodies).toEqual([{ changeRef: 'CHG-2026-409' }, { changeRef: 'CHG-2026-409' }]);
});
