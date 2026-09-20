import { expect, type Page } from '@playwright/test';

/** Dev-bypass sign-in (AUTH_DEV_BYPASS on the backend; no OTP). Mirrors the "Development sign-in" box on /login. */
export async function devLogin(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  // Wait for React to hydrate the form; a click before hydration submits the form natively (GET /login?).
  await page.waitForFunction(() => {
    const form = document.querySelector('form');
    return !!form && Object.keys(form).some((k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
  }, undefined, { timeout: 30_000 });
  const details = page.getByText('Development sign-in (seeded accounts, no OTP)');
  await details.click();
  await page.getByLabel('Seeded dev user').fill(email);
  await page.getByRole('button', { name: 'Sign in (dev bypass)' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export const ACCOUNTS = {
  requestor: 'requestor@dev.local',
  paidRequestor: 'requestor@paid.local',
  admin: 'admin@dev.local',
  paidAdmin: 'admin@paid.local',
  sysadmin: 'sysadmin@dev.local',
  audit: 'audit@dev.local',
  // The demo tenant holds the assessment history; an auditor there can exercise reconstruction (FR-26, SEC-07).
  paidAudit: 'audit@paid.local',
};
