/**
 * Portal Page E2E Tests
 *
 * Tests for the portal page at https://bunterm.royalpeace.co.jp/:
 * 1. Portal page loads and tmux session list is displayed
 * 2. Connect button uses data-* attributes (no inline onclick — CSP fix verified)
 * 3. Connect button click navigates to session page; session page has no CSP errors
 *
 * Known issue (separate from Connect button fix):
 *   The portal page itself has one remaining "inline script" CSP violation
 *   (a <script> tag without a nonce). This does NOT block navigation.
 */

import { test, expect } from '@playwright/test';

const PORTAL_URL = 'https://bunterm.royalpeace.co.jp/';

async function waitForSessionsSection(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const section = document.querySelector('#tmuxSessionsSection') as HTMLElement | null;
      return section !== null && section.style.display === 'block';
    },
    { timeout: 15000 }
  );
}

test.describe('Portal Page - tmux session list', () => {
  test('portal page loads and shows tmux session section', async ({ page }) => {
    await page.goto(PORTAL_URL);
    await waitForSessionsSection(page);

    const section = page.locator('#tmuxSessionsSection');
    await expect(section).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/portal-sessions-visible.png', fullPage: true });
  });

  test('tmux session list shows connect buttons with data-* attributes (no inline onclick)', async ({ page }) => {
    await page.goto(PORTAL_URL);
    await waitForSessionsSection(page);

    const connectButtons = page.locator('.tmux-connect-btn');
    await expect(connectButtons.first()).toBeVisible({ timeout: 10000 });

    const count = await connectButtons.count();
    console.log(`Found ${count} connect button(s)`);
    expect(count).toBeGreaterThan(0);

    // Verify CSP fix: no inline onclick, using data-tmux-connect attribute instead
    const firstBtn = connectButtons.first();
    const onclick = await firstBtn.getAttribute('onclick');
    const dataAttr = await firstBtn.getAttribute('data-tmux-connect');
    console.log('onclick attribute (should be null):', onclick);
    console.log('data-tmux-connect (should have value):', dataAttr);

    expect(onclick).toBeNull();
    expect(dataAttr).not.toBeNull();

    await page.screenshot({ path: 'e2e/screenshots/portal-connect-buttons.png', fullPage: true });
  });

  test('clicking Connect navigates to session page; session page has no CSP errors', async ({ page }) => {
    // Track CSP errors per-page phase
    const portalCspErrors: string[] = [];
    const sessionCspErrors: string[] = [];
    let navigated = false;

    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('content security policy')) {
        const text = msg.text();
        if (!navigated) {
          portalCspErrors.push(text);
        } else {
          sessionCspErrors.push(text);
        }
      }
    });

    await page.goto(PORTAL_URL);
    await page.waitForTimeout(1500); // Let portal CSP errors settle

    await waitForSessionsSection(page);

    const connectBtn = page.locator('.tmux-connect-btn').first();
    await expect(connectBtn).toBeVisible({ timeout: 10000 });

    const sessionName = await connectBtn.getAttribute('data-tmux-connect');
    console.log('Connecting to tmux session:', sessionName);

    // Mark transition point, then click
    navigated = true;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'commit', timeout: 20000 }),
      connectBtn.click(),
    ]);

    await page.waitForTimeout(2000); // Let session page CSP errors settle

    const newUrl = page.url();
    console.log('Navigated to:', newUrl);

    // Verify URL changed to session page
    expect(newUrl).not.toBe(PORTAL_URL);
    const urlPath = new URL(newUrl).pathname;
    expect(urlPath).not.toBe('/');
    // Path should contain the session name
    expect(urlPath).toContain(encodeURIComponent(sessionName ?? ''));

    // Session page must have zero CSP errors
    console.log(`Session page CSP errors: ${sessionCspErrors.length}`);
    sessionCspErrors.forEach(e => console.log(' -', e.substring(0, 200)));
    expect(sessionCspErrors).toHaveLength(0);

    // Log portal page CSP errors as informational (separate issue)
    console.log(`\nPortal page CSP errors (separate issue, non-blocking): ${portalCspErrors.length}`);
    portalCspErrors.forEach(e => console.log(' -', e.substring(0, 200)));

    await page.screenshot({ path: 'e2e/screenshots/portal-after-connect.png', fullPage: true });
  });
});
