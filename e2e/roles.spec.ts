import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, devLogin } from './helpers';

/** T-100: one journey per role, plus the role guard (DASH-04, SEC-01) and the AI-01 decision path. */

async function expectNoInternalRequirementKeys(page: Page) {
  await expect(page.locator('header.workspace-header')).not.toContainText(/\b(?:AI|DASH|FR|NFR|SEC)-\d/);
}

test.describe('requestor', () => {
  test('starts an assessment, answers structured questions, submits and records a decision [FR-03..08, FR-22, AI-01]', async ({ page }) => {
    test.setTimeout(300_000); // free-text turns call the real model (1–3 s each) on the dev backend
    // The FREE requestor is also the interactive shared-demo identity. Use the dedicated PAID
    // requestor so a developer reviewing the demo in another browser cannot supersede this session.
    await devLogin(page, ACCOUNTS.paidRequestor);
    await expect(page).toHaveURL(/\/chat/);
    await expectNoInternalRequirementKeys(page);
    await page.getByRole('button', { name: 'Finance Officer' }).click();
    await page.getByPlaceholder(/vendor wire/).fill('A $25,000 customer-funds vendor payment was sent without the required second approval. Treasury recalled the payment, notified the customer, and disabled the compromised employee account.');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/chat\/[a-f0-9]{24}/);
    // Answer whatever the flow asks until the submit bar appears (MCQ/yes-no/number are structured; free text goes to the extractor).
    // The focused structured-choice card intentionally replaces the docked composer, so a turn waits for its optimistic answer
    // to be replaced by the canonical transcript instead of assuming one persistent input surface.
    const turn = async (act: () => Promise<void>) => {
      await act();
      await expect(page.getByTestId('optimistic-answer')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('optimistic-answer')).toHaveCount(0, { timeout: 45_000 });
    };
    await expect(page.getByTestId('assessment-conversation-page')).toBeVisible({ timeout: 30_000 });
    let freeTextTurn = 0;
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole('button', { name: /^Submit/ }).isVisible().catch(() => false)) break;
      const choiceCard = page.getByTestId('inline-choice-card');
      const mcq = choiceCard.locator('[data-testid="answer-option"]');
      const binary = choiceCard.locator('[data-testid="binary-answer-option"]');
      const number = page.getByPlaceholder(/number/i);
      const text = page.getByPlaceholder(/^Type your answer/i);
      if (await mcq.first().isVisible().catch(() => false)) {
        const prompt = (await choiceCard.textContent() ?? '').toLowerCase();
        const preferred = prompt.includes('customer funds')
          ? 'Customer funds'
          : prompt.includes('still active')
            ? 'Contained'
            : prompt.includes('origin')
              ? 'Unrecognized'
              : prompt.includes('execut')
                ? 'Manually'
                : null;
        await turn(() => preferred ? choiceCard.getByRole('button', { name: preferred, exact: true }).click() : mcq.first().click());
      }
      else if (await binary.first().isVisible().catch(() => false)) {
        const prompt = (await choiceCard.textContent() ?? '').toLowerCase();
        const answer = prompt.includes('authorized according') || prompt.includes('all required approvals') || prompt.includes('similar incident')
          ? 'No'
          : 'Yes';
        await turn(() => choiceCard.getByRole('button', { name: answer, exact: true }).click());
      }
      else if (await number.isVisible().catch(() => false)) await turn(async () => { await number.fill('25000'); await page.keyboard.press('Enter'); });
      else if (await text.isVisible().catch(() => false)) {
        const answer = freeTextTurn++ === 0
          ? 'Vendor payment approval and treasury wire transfer.'
          : 'Treasury recalled the payment, notified the customer, and disabled the compromised employee account.';
        await turn(async () => { await text.fill(answer); await page.keyboard.press('Enter'); });
      }
      else await page.waitForTimeout(500);
    }
    await page.getByRole('button', { name: /^Submit/ }).click();
    const result = page.getByTestId('assessment-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result.getByRole('img', { name: /\d+ \/ 100 risk score/ })).toBeVisible();
    const classificationBadge = result.getByTestId('result-classification-badge');
    await expect(classificationBadge).toHaveAttribute('data-classification', 'elevated_risk');
    await expect(classificationBadge).toHaveClass(/bg-orange-50/);
    await expect(page.getByText('Recommended action', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Accept recommendation' }).click();
    await page.getByLabel('Decision note (optional)').fill('Accepted because the captured evidence and control failure support the recommended classification.');
    await page.getByRole('button', { name: 'Confirm acceptance' }).click();
    await expect(page.getByText(/Decision recorded: accept/)).toBeVisible({ timeout: 15_000 });
    const closedStatus = page.getByTestId('assessment-status-badge');
    await expect(closedStatus).toHaveAttribute('data-status', 'closed');
    await expect(closedStatus).toHaveClass(/bg-emerald-50/);
    const contextDisclosure = page.getByTestId('assessment-context-disclosure');
    if (await contextDisclosure.isVisible().catch(() => false)) await contextDisclosure.locator(':scope > summary').click();
    await expect(page.locator('[data-testid="decision-details"]:visible').first()).toBeVisible();
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'Requestor dashboard — pending queue' })).toBeVisible();
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
  test('sees the content library, review queue, analytics and standard reports [DASH-02, AI-03, DASH-03, FR-26, FR-28]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.paidAdmin);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/admin/personas');
    await expect(page.getByRole('heading', { name: /Persona management/ })).toBeVisible();
    await page.goto('/admin/review');
    await expect(page.getByRole('heading', { name: 'Mandatory review queue' })).toBeVisible();
    await page.goto('/admin/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics dashboard' })).toBeVisible();
    await expectNoInternalRequirementKeys(page);
    await expect(page.getByText('Assessment volume', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monthly classification distribution' })).toBeVisible();
    const monthlyViews = page.getByRole('group', { name: 'Monthly classification view' });
    await monthlyViews.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('columnheader', { name: 'Month' })).toBeVisible();

    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Standard reports' })).toBeVisible();
    const volumeReport = page.getByRole('heading', { name: 'Assessment volume', exact: true });
    await expect(volumeReport).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Classification distribution', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assessment volume · CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assessment volume · PDF' })).toBeVisible();
    await volumeReport.click();
    const volumeViews = page.getByRole('group', { name: 'Assessment volume · Table view' });
    await volumeViews.getByRole('button', { name: 'Table' }).click();
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
    await expect(page).toHaveURL(/\/system\/users$/);
    await expect(page.getByRole('heading', { name: 'User and role provisioning' })).toBeVisible();
    await expectNoInternalRequirementKeys(page);
    await page.goto('/system/tenant');
    await expect(page.getByRole('heading', { name: 'SSO and integration configuration' })).toBeVisible();
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
    // Privileged seed roles live in the `tac` tenant, which carries no assessment history; reconstruction and chain
    // verification need the demo tenant's auditor.
    await devLogin(page, ACCOUNTS.paidAudit);
    await expect(page).toHaveURL(/\/audit\/logs$/);
    await expect(page.getByRole('heading', { name: 'Audit log viewer' })).toBeVisible();
    await expectNoInternalRequirementKeys(page);
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

  test('account menu exposes the English-only launch language [NFR-08]', async ({ page }) => {
    await devLogin(page, ACCOUNTS.audit);
    await page.locator('summary').filter({ hasText: /· Audit$/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('language-indicator')).toContainText('English');
    await expect(page.getByText('বাংলা', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Audit log viewer' })).toBeVisible();
  });
});
