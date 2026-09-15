import { expect, test } from '@playwright/test';
import { ACCOUNTS, devLogin } from './helpers';

/** T-100: one journey per role, plus the role guard (DASH-04, SEC-01) and the AI-01 decision path. */

test.describe('requestor', () => {
  test('starts an assessment, answers structured questions, submits and records a decision [FR-03..08, FR-22, AI-01]', async ({ page }) => {
    test.setTimeout(300_000); // free-text turns call the real model (1–3 s each) on the dev backend
    await devLogin(page, ACCOUNTS.requestor);
    await expect(page).toHaveURL(/\/chat/);
    await page.getByRole('button', { name: 'Finance Officer' }).click();
    await page.getByPlaceholder(/vendor wire/).fill('A vendor wire of $250,000 went out yesterday without the second approval and nobody can find the request.');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}/);
    // Answer whatever the flow asks until the submit bar appears (MCQ/yes-no/number are structured; free text goes to the extractor).
    // One turn = act, then wait until the composer is idle again with a longer transcript (the UI answers, then reloads).
    const composer = page.getByTestId('composer');
    const turn = async (act: () => Promise<void>) => {
      const before = Number(await composer.getAttribute('data-messages'));
      await act();
      await page.waitForFunction(
        (n) => { const c = document.querySelector('[data-testid="composer"]'); return !!c && c.getAttribute('data-busy') === 'false' && (Number(c.getAttribute('data-messages')) > n || c.getAttribute('data-status') !== 'in_progress'); },
        before,
        { timeout: 45_000 },
      );
    };
    await expect(composer).toHaveAttribute('data-status', /in_progress|intake_complete/, { timeout: 30_000 });
    for (let i = 0; i < 40; i++) {
      if ((await composer.getAttribute('data-status')) !== 'in_progress') break;
      const mcq = page.locator('[data-testid="answer-option"]').first();
      const no = page.getByRole('button', { name: /^No$/ });
      const number = page.getByPlaceholder(/number/i);
      const text = page.getByPlaceholder(/^Type your answer/i);
      if (await mcq.isVisible().catch(() => false)) await turn(() => mcq.click());
      else if (await no.isVisible().catch(() => false)) await turn(() => no.click());
      else if (await number.isVisible().catch(() => false)) await turn(async () => { await number.fill('1000'); await page.keyboard.press('Enter'); });
      else if (await text.isVisible().catch(() => false)) await turn(async () => { await text.fill('It was a one-off vendor payment of about 250000 dollars; treasury has been informed and the bank recall is in progress.'); await page.keyboard.press('Enter'); });
      else await page.waitForTimeout(500);
    }
    await page.getByRole('button', { name: /^Submit/ }).click();
    await expect(page.getByText(/\/ 100 risk score/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Recommended action', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accept recommendation' }).click();
    await expect(page.getByText(/Decision recorded: accept/)).toBeVisible();
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'Assessments' })).toBeVisible();
    await expect(page.getByText('Closed').first()).toBeVisible();
  });

  test('cannot open administrator or audit screens [SEC-01, DASH-04]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.requestor);
    await page.goto('/admin/personas');
    await expect(page).toHaveURL(/\/chat/);
    await page.goto('/audit/logs');
    await expect(page).toHaveURL(/\/chat/);
  });
});

test.describe('administrator', () => {
  test('sees the content library, review queue and analytics [DASH-02, AI-03, DASH-03]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.paidAdmin);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/admin/personas');
    await expect(page.getByRole('heading', { name: /Personas/ })).toBeVisible();
    await page.goto('/admin/review');
    await expect(page.getByRole('heading', { name: 'Mandatory review queue' })).toBeVisible();
    await page.goto('/admin/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByText('Assessment volume')).toBeVisible();
    await expect(page.getByText(/Started/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Table' }).first().click();
    await expect(page.getByRole('columnheader', { name: 'Period' })).toBeVisible();
  });

  test('scoring simulator page loads [FR-18]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.admin);
    await page.goto('/admin/scoring');
    await expect(page.getByRole('heading', { name: /Scoring/ })).toBeVisible();
  });
});

test.describe('system administrator', () => {
  test('edits tenant settings and runs a retention dry run [FR-03, SEC-02, SEC-06]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.sysadmin);
    await expect(page).toHaveURL(/\/system$/);
    await page.goto('/system/tenant');
    await expect(page.getByRole('heading', { name: 'Tenant settings' })).toBeVisible();
    const idle = page.getByLabel('Idle timeout (minutes, 5–30)');
    const current = await idle.inputValue();
    const next = current === '15' ? '20' : '15';
    await idle.fill(next);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Changes saved at .*audit log/)).toBeVisible();
    await idle.fill(current);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/Changes saved at .*audit log/)).toBeVisible();
    await page.goto('/system/retention');
    await page.getByRole('button', { name: 'Dry run (report only)' }).click();
    await expect(page.getByText(/Dry run · /)).toBeVisible();
  });
});

test.describe('audit', () => {
  test('reads assessments, reconstructs one from the audit log, verifies the chain [FR-26, SEC-07]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.audit);
    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole('link', { name: 'Assessments', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Assessments', exact: true }).click();
    await expect(page).toHaveURL(/\/audit\/assessments/);
    await expect(page.getByRole('heading', { name: 'Assessments (audit view)' })).toBeVisible();
    await page.getByRole('button', { name: 'Reconstruct' }).first().click();
    await expect(page.getByText(/Hash chain entries verified|Tampered entries/)).toBeVisible();
    await expect(page.getByText(/Timeline \(\d+ entries\)/)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/audit/logs');
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.getByText(/Chain intact/)).toBeVisible();
  });

  test('language switcher changes the shell labels [NFR-08]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.audit);
    await page.getByRole('button', { name: 'বাংলা' }).click();
    await expect(page.getByRole('link', { name: 'অডিট লগ' })).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('link', { name: 'Audit logs' })).toBeVisible();
  });
});
