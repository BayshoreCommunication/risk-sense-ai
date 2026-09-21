import { expect, test, type Page } from '@playwright/test';
import { applyAuthHeaders, AuthBridgeState } from '../lib/api/auth-state';
import { runVerificationRecovery } from '../lib/firebase/verification-recovery';
import { isPublicDemoAccessAvailable } from '../lib/public-demo';
import type { Role } from '../lib/session';

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

async function mockVerifiedPasswordSignIn(page: Page, email: string, uid: string, expectedPassword?: string) {
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const idToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    aud: 'frontend-test',
    auth_time: now,
    email,
    email_verified: true,
    exp: now + 3_600,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
    iat: now,
    iss: 'https://securetoken.google.com/frontend-test',
    sub: uid,
    user_id: uid,
  })}.test-signature`;

  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/accounts:signInWithPassword')) {
      const credentials = route.request().postDataJSON() as { email?: string; password?: string };
      expect(credentials.email).toBe(email);
      if (expectedPassword !== undefined) expect(credentials.password).toBe(expectedPassword);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: '',
          email,
          emailVerified: true,
          expiresIn: '3600',
          idToken,
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: uid,
          refreshToken: `refresh-${uid}`,
          registered: true,
        }),
      });
      return;
    }
    if (path.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#GetAccountInfoResponse',
          users: [{
            createdAt: String(now * 1_000),
            email,
            emailVerified: true,
            lastLoginAt: String(now * 1_000),
            localId: uid,
            providerUserInfo: [{ email, federatedId: email, providerId: 'password' }],
            validSince: '0',
          }],
        }),
      });
      return;
    }
    await route.abort('failed');
  });
}

test('persisted Firebase restoration gates the first protected request until its bearer exists [SEC-02]', async () => {
  for (const devAuthEnabled of [false, true]) {
    const state = new AuthBridgeState();
    state.setIdTokenProvider(null); // A cold-start `currentUser === null` must not settle restoration.

    const request = new Request('http://risk-sense.test/me');
    let dispatched = false;
    const firstMe = applyAuthHeaders(
      request,
      { sessionId: 'persisted-session', devAuthEnabled },
      state,
    ).then((authorizedRequest) => {
      dispatched = true;
      return authorizedRequest;
    });

    await nextTurn();
    expect(dispatched).toBe(false);

    state.completeInitialState(async () => 'persisted-id-token');
    const authorizedRequest = await firstMe;
    expect(authorizedRequest.headers.get('Authorization')).toBe('Bearer persisted-id-token');
    expect(authorizedRequest.headers.get('X-Session-Id')).toBe('persisted-session');
  }
});

test('public requests do not wait and explicit sign-in tokens are immediately usable [SEC-02]', async () => {
  const state = new AuthBridgeState();
  const publicRequest = await applyAuthHeaders(
    new Request('http://risk-sense.test/auth/sso/lookup'),
    { devAuthEnabled: false },
    state,
  );
  expect(publicRequest.headers.get('Authorization')).toBeNull();

  state.setIdTokenProvider(async () => 'fresh-sign-in-token');
  const protectedRequest = await applyAuthHeaders(
    new Request('http://risk-sense.test/me'),
    { sessionId: 'new-session', devAuthEnabled: false },
    state,
  );
  expect(protectedRequest.headers.get('Authorization')).toBe('Bearer fresh-sign-in-token');

  const devRequest = await applyAuthHeaders(
    new Request('http://risk-sense.test/me'),
    { sessionId: 'dev-session', devAuthEnabled: true, devUser: 'requestor@dev.local' },
    new AuthBridgeState(),
  );
  expect(devRequest.headers.get('Authorization')).toBeNull();
  expect(devRequest.headers.get('X-Dev-User')).toBe('requestor@dev.local');
  expect(devRequest.headers.get('X-Session-Id')).toBe('dev-session');
});

test('verification delivery failure signs out and a retry can resend without an app session [FR-01, SEC-02]', async () => {
  const user = { emailVerified: false };
  const events: string[] = [];
  let sendAttempts = 0;
  const operations = {
    signIn: async () => {
      events.push('sign-in');
      return user;
    },
    reload: async () => {
      events.push('reload');
    },
    isEmailVerified: () => user.emailVerified,
    sendVerification: async () => {
      events.push('send-verification');
      sendAttempts += 1;
      if (sendAttempts === 1) throw new Error('mail provider unavailable');
    },
    signOut: async () => {
      events.push('sign-out');
    },
    clearTokenProvider: () => {
      events.push('clear-token');
    },
  };

  let firstError: unknown;
  try {
    await runVerificationRecovery(operations);
  } catch (error) {
    firstError = error;
  }
  expect(firstError).toEqual(new Error('mail provider unavailable'));
  expect(events).toEqual(['sign-in', 'reload', 'send-verification', 'sign-out', 'clear-token']);

  events.length = 0;
  await expect(runVerificationRecovery(operations)).resolves.toBe('sent');
  expect(events).toEqual(['sign-in', 'reload', 'send-verification', 'sign-out', 'clear-token']);
});

test('already-verified recovery skips delivery but still signs out [FR-01, SEC-02]', async () => {
  const events: string[] = [];
  await expect(
    runVerificationRecovery({
      signIn: async () => {
        events.push('sign-in');
        return { emailVerified: true };
      },
      reload: async () => {
        events.push('reload');
      },
      isEmailVerified: (user) => user.emailVerified,
      sendVerification: async () => {
        events.push('send-verification');
      },
      signOut: async () => {
        events.push('sign-out');
      },
      clearTokenProvider: () => {
        events.push('clear-token');
      },
    }),
  ).resolves.toBe('already-verified');
  expect(events).toEqual(['sign-in', 'reload', 'sign-out', 'clear-token']);
});

test('a verified FREE requestor receives a session without entering the PAID MFA flow [FR-01, FR-02]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const email = 'free.requestor@example.test';
  const session = {
    user: {
      id: 'free-user-1',
      firebaseUid: 'firebase-free-user-1',
      email,
      name: 'Free Requestor',
      role: 'requestor',
      tenantId: 'public-tenant',
      departmentIds: [],
      crossDepartmentAccess: false,
      mfaEnrolled: false,
    },
    tenant: {
      id: 'public-tenant',
      slug: 'public',
      plan: 'free',
      features: { sso: false, reviewDashboard: false, reports: false, fullAudit: false, departmentMapping: false, blockConcurrentLogin: false },
      sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
    },
    sessionId: 'free-session-1',
    expiresAt: '2026-09-15T10:00:00.000Z',
  };
  let sessionCalls = 0;
  let otpRequests = 0;
  await mockVerifiedPasswordSignIn(page, email, 'firebase-free-user-1');
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/auth/session') {
      sessionCalls += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: session, meta: { requestId: 'free-login' } }) });
      return;
    }
    if (path === '/auth/otp/request') {
      otpRequests += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    if (path === '/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: session, meta: { requestId: 'free-me' } }) });
      return;
    }
    if (path === '/personas') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { requestId: 'free-personas' } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Persona and scenario selection' })).toBeVisible();
  expect(sessionCalls).toBe(1);
  expect(otpRequests).toBe(0);
});

test('public demo configuration fails closed unless the deployment flag is explicitly enabled [FR-01, SEC-03]', () => {
  expect(isPublicDemoAccessAvailable(undefined)).toBe(false);
  expect(isPublicDemoAccessAvailable('')).toBe(false);
  expect(isPublicDemoAccessAvailable('false')).toBe(false);
  expect(isPublicDemoAccessAvailable('TRUE')).toBe(false);
  expect(isPublicDemoAccessAvailable('true')).toBe(true);
});

const publicDemoCases: Array<{ email: string; label: string; role: Role; home: string }> = [
  { email: 'requestor@tac.local', label: 'Requestor', role: 'requestor', home: '/chat' },
  { email: 'admin@dev.local', label: 'Administrator', role: 'administrator', home: '/admin' },
  { email: 'sysadmin@dev.local', label: 'System Administrator', role: 'system_administrator', home: '/system/users' },
  { email: 'audit@dev.local', label: 'Audit', role: 'audit', home: '/audit/logs' },
];

function publicDemoSession(account: (typeof publicDemoCases)[number], role = account.role) {
  return {
    user: {
      id: `demo-${role}`,
      firebaseUid: `firebase-demo-${role}`,
      email: account.email,
      name: `${account.label} Demo`,
      role,
      tenantId: 'tac-tenant',
      departmentIds: [],
      crossDepartmentAccess: true,
      mfaEnrolled: true,
    },
    tenant: {
      id: 'tac-tenant',
      slug: 'tac',
      plan: 'paid',
      features: { sso: true, reviewDashboard: true, reports: true, fullAudit: true, departmentMapping: true, blockConcurrentLogin: false },
      sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 },
      sectors: ['financial', 'healthcare', 'it', 'general'],
    },
    sessionId: `demo-session-${role}`,
    expiresAt: '2026-09-22T10:00:00.000Z',
    accessMode: 'public_demo_read_only',
  };
}

for (const account of publicDemoCases) {
  test(`shared ${account.label} demo requests a server-scoped session and redirects by the backend role [FR-01, FR-02, SEC-03, DASH-04]`, async ({ page }, testInfo) => {
    test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
    const session = publicDemoSession(account);
    let demoSessionCalls = 0;
    let ordinarySessionCalls = 0;
    let otpRequests = 0;
    await page.route('**/test-api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
      if (path === '/auth/public-demo/session' && route.request().method() === 'POST') {
        demoSessionCalls += 1;
        expect(route.request().postDataJSON()).toEqual({ role: account.role });
        expect(route.request().headers().authorization).toBeUndefined();
        expect(route.request().headers()['x-dev-user']).toBeUndefined();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: session, meta: { requestId: 'demo-login' } }) });
        return;
      }
      if (path === '/auth/session' && route.request().method() === 'POST') {
        ordinarySessionCalls += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }
      if (path === '/auth/otp/request') {
        otpRequests += 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }
      if (path === '/me') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: session, meta: { requestId: 'demo-me' } }) });
        return;
      }
      if (path === '/audit-logs') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [], nextCursorSeq: null }, meta: { requestId: 'demo-audit' } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { requestId: 'demo-data' } }) });
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Explore every role' })).toBeVisible();
    await expect(page.getByText('Shared read-only demo', { exact: true })).toHaveCount(4);
    await page.getByRole('button', { name: `Open ${account.label} demo` }).click();

    await expect(page).toHaveURL(new RegExp(`${account.home.replace('/', '\\/')}$`));
    await expect(page.getByText('Shared read-only demo — changes are disabled and demo data is resettable.')).toBeVisible();
    expect(demoSessionCalls).toBe(1);
    expect(ordinarySessionCalls).toBe(0);
    expect(otpRequests).toBe(0);
  });
}

test('public demo role mismatch terminates and clears the unexpected session [FR-02, SEC-02, SEC-03]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const account = publicDemoCases[0]!;
  const mismatched = publicDemoSession(account, 'administrator');
  let logoutCalls = 0;
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/auth/public-demo/session' && route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: mismatched, meta: { requestId: 'demo-mismatch' } }) });
      return;
    }
    if (path === '/auth/session' && route.request().method() === 'DELETE') {
      logoutCalls += 1;
      expect(route.request().headers()['x-session-id']).toBe(mismatched.sessionId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { loggedOut: true }, meta: { requestId: 'demo-cleanup' } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Open Requestor demo' }).click();

  await expect(page.locator('p[role="alert"]')).toContainText('That demo identity returned a different role.');
  await expect(page.getByRole('button', { name: 'Open Requestor demo' })).toBeEnabled();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'rs_session' || cookie.name === 'rs_role')).toBe(false);
  expect(logoutCalls).toBe(1);
});

test('public demo tenant mismatch terminates and clears the unexpected session [FR-02, SEC-02, SEC-03]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const account = publicDemoCases[0]!;
  const mismatched = { ...publicDemoSession(account), tenant: { ...publicDemoSession(account).tenant, slug: 'customer' } };
  let logoutCalls = 0;
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/auth/public-demo/session' && route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: mismatched, meta: { requestId: 'demo-tenant-mismatch' } }) });
      return;
    }
    if (path === '/auth/session' && route.request().method() === 'DELETE') {
      logoutCalls += 1;
      expect(route.request().headers()['x-session-id']).toBe(mismatched.sessionId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { loggedOut: true }, meta: { requestId: 'demo-cleanup' } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Open Requestor demo' }).click();

  await expect(page.locator('p[role="alert"]')).toContainText('That demo identity returned an unexpected workspace.');
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'rs_session' || cookie.name === 'rs_role')).toBe(false);
  expect(logoutCalls).toBe(1);
});

test('public demo access-mode mismatch terminates and clears a writable session [FR-02, SEC-02, SEC-03]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const account = publicDemoCases[0]!;
  const mismatched = { ...publicDemoSession(account), accessMode: 'standard' };
  let logoutCalls = 0;
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/auth/public-demo/session' && route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: mismatched, meta: { requestId: 'demo-mode-mismatch' } }) });
      return;
    }
    if (path === '/auth/session' && route.request().method() === 'DELETE') {
      logoutCalls += 1;
      expect(route.request().headers()['x-session-id']).toBe(mismatched.sessionId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { loggedOut: true }, meta: { requestId: 'demo-cleanup' } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Open Requestor demo' }).click();

  await expect(page.locator('p[role="alert"]')).toContainText('Read-only demo protection was not confirmed.');
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'rs_session' || cookie.name === 'rs_role')).toBe(false);
  expect(logoutCalls).toBe(1);
});

test('a verified PAID account enters the current-login MFA flow when session exchange requires it [FR-01, SEC-03]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const email = 'paid.requestor@example.test';
  let sessionCalls = 0;
  let otpRequests = 0;
  await mockVerifiedPasswordSignIn(page, email, 'firebase-paid-user-1');
  await page.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
    if (path === '/auth/session') {
      sessionCalls += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'OTP_REQUIRED', message: 'A verification code is required to sign in' }, meta: { requestId: 'paid-login' } }),
      });
      return;
    }
    if (path === '/auth/otp/request') {
      otpRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { sentTo: 'pa***@example.test', expiresAt: '2026-09-15T10:00:00.000Z', devCode: '123456' }, meta: { requestId: 'paid-otp' } }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByLabel('Verification code')).toBeVisible();
  // The masked destination proves the OTP was requested for this identity…
  await expect(page.getByText('pa***@example.test')).toBeVisible();
  // …and the code itself never reaches a non-development build: DEV_AUTH_ENABLED needs NODE_ENV and
  // NEXT_PUBLIC_ENV to both be "development", and this suite builds with NEXT_PUBLIC_ENV=ci (SEC-03).
  await expect(page.getByText('Dev mail provider')).toHaveCount(0);
  await expect(page.getByText('123456')).toHaveCount(0);
  expect(sessionCalls).toBe(1);
  expect(otpRequests).toBe(1);
});

test('unverified password account sees a retryable resend flow without an application-session call [FR-01, SEC-02, NFR-08]', async ({ page }, testInfo) => {
  test.skip(testInfo.config.metadata.frontendMocks !== true, 'requires the isolated mocked-Firebase frontend build');
  const email = 'unverified@example.test';
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const idToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    aud: 'frontend-test',
    auth_time: now,
    email,
    email_verified: false,
    exp: now + 3_600,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
    iat: now,
    iss: 'https://securetoken.google.com/frontend-test',
    sub: 'firebase-user-1',
    user_id: 'firebase-user-1',
  })}.test-signature`;
  let deliveryAttempts = 0;
  const backendCalls: string[] = [];

  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/accounts:signInWithPassword')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: '',
          email,
          expiresIn: '3600',
          idToken,
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: 'firebase-user-1',
          refreshToken: 'test-refresh-token',
          registered: true,
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/accounts:lookup')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#GetAccountInfoResponse',
          users: [{
            createdAt: String(now * 1_000),
            email,
            emailVerified: false,
            lastLoginAt: String(now * 1_000),
            localId: 'firebase-user-1',
            providerUserInfo: [{ email, federatedId: email, providerId: 'password' }],
            validSince: '0',
          }],
        }),
      });
      return;
    }
    if (url.pathname.endsWith('/accounts:sendOobCode')) {
      deliveryAttempts += 1;
      if (deliveryAttempts === 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email }) });
      }
      return;
    }
    await route.abort('failed');
  });
  await page.route('**/test-api/**', async (route) => {
    backendCalls.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Resend verification email' }).click();

  await expect(page.locator('p[role="alert"]')).toContainText('auth/too-many-requests');
  await expect(page.getByLabel('Work email')).toHaveValue(email);
  await expect(page.getByLabel('Password')).toHaveValue('correct-horse-battery-staple');

  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByRole('status')).toContainText(`We sent a new verification link to ${email}`);
  expect(deliveryAttempts).toBe(2);
  expect(backendCalls).toEqual([]);

  await page.context().addCookies([{ name: 'rs_locale', value: 'bn', url: 'http://127.0.0.1:3100' }]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
});
