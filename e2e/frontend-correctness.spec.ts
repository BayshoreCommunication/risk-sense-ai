import { expect, test, type Page, type Route } from '@playwright/test';

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
      plan: featureOverrides.reports ? 'paid' : 'free',
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
  await expect(page.getByText('New risk assessment', { exact: true })).toBeVisible();
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

test('administrator landing is useful and reports navigation follows /me features [DASH-02, DASH-03]', async ({ page }) => {
  let reports = false;
  await authenticate(page, 'administrator');
  await mockApi(page, () => currentUser('administrator', { reports }));

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administrator workspace' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mandatory review/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toHaveCount(0);

  reports = true;
  await page.reload();
  await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Retention' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Departments', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Disaster recovery', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conformance', exact: true })).toBeVisible();
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
  await expect(page.getByText('Confirm your role')).toBeVisible();
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
  await expect(page.getByText('Confirm your role')).toBeVisible();
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
  await page.getByRole('button', { name: 'Change role' }).click();
  await page.getByTestId('persona-option').filter({ hasText: 'IT Support' }).click();
  await expect.poll(() => submitted).toEqual({ personaKey: 'it_support' });
});
