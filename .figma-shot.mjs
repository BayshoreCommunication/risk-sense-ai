import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3100';
const [out, role, path] = process.argv.slice(2);
const me = { user: { id: '1', firebaseUid: 'u', email: 'maya@example.test', name: 'Maya Osei', role, tenantId: 't1', departmentIds: [], crossDepartmentAccess: true, mfaEnrolled: true },
  tenant: { id: 't1', slug: 'test', plan: 'paid', features: { sso: true, reviewDashboard: true, reports: true, fullAudit: true, departmentMapping: true, blockConcurrentLogin: false }, sessionPolicy: { idleTimeoutMin: 15, maxConcurrentSessions: 1 } }, sessionId: 's1' };
const factor = (w) => ({ weight: w, scale: { min: 1, max: 5 }, mapping: [] });
const matrix = { _id: 'm1', key: 'default', name: 'financial services', sector: 'financial', status: 'active', version: 1, isCurrent: true, approvedBy: 'x',
  factors: { controlEffectiveness: factor(25), impact: factor(20), severity: factor(20), likelihood: factor(20), duration: factor(0), regulatorySensitivity: factor(15) },
  thresholds: { monitor_only: { min: 0, max: 29 }, risk: { min: 30, max: 54 }, elevated_risk: { min: 55, max: 79 }, issue: { min: 80, max: 100 } } };
const d = (x) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: x, meta: { requestId: 'shot' } }) });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: 'rs_session', value: 's1', url: BASE }, { name: 'rs_role', value: role, url: BASE }]);
const page = await ctx.newPage();
await page.route('**/test-api/**', async (route) => {
  const p = new URL(route.request().url()).pathname.replace(/^\/test-api/, '');
  if (p === '/me') return route.fulfill(d(me));
  if (p === '/scoring-matrices') return route.fulfill(d([matrix]));
  return route.fulfill(d([]));
});
await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
