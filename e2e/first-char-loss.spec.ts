/**
 * E2E test for first character loss issue
 *
 * Tests that when sending text via the toolbar, all characters are received correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('First Character Loss Debug', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the terminal
    await page.goto('http://localhost:7680/ttyd-mux/');

    // Wait for terminal to be ready
    await page.waitForSelector('.xterm-screen', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Show the toolbar - need to click twice to go from hidden -> minimized -> full
    const toggleBtn = page.locator('#tui-toggle');
    await toggleBtn.click(); // hidden -> minimized
    await page.waitForTimeout(300);
    await toggleBtn.click(); // minimized -> full
    await page.waitForTimeout(300);

    // Verify input is visible
    const input = page.locator('#tui-input');
    await expect(input).toBeVisible({ timeout: 5000 });
  });

  test('toolbar input should send all characters', async ({ page }) => {
    const input = page.locator('#tui-input');

    // First, clear the terminal and ensure we have a shell prompt
    // Send a clear command to clean terminal state
    await input.fill('clear');
    await input.press('Enter');
    await page.waitForTimeout(500);

    // Type a simple test string with unique marker
    const marker = `MARKER_${Date.now()}`;
    const testString = `echo ${marker}`;
    await input.fill(testString);

    // Get the input value to verify it was typed correctly
    const inputValue = await input.inputValue();
    console.log(`Input value before send: "${inputValue}"`);
    expect(inputValue).toBe(testString);

    // Press Enter to send (toolbar captures Enter key)
    await input.press('Enter');

    // Wait for command to execute
    await page.waitForTimeout(2000);

    // Check the terminal output for the echoed text
    // Use .xterm-rows to get actual terminal text content
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    console.log('Terminal content length:', terminalContent?.length);
    console.log('Terminal content (last 300):', terminalContent?.slice(-300));

    // The output should contain the marker (echoed by echo command)
    expect(terminalContent).toContain(marker);
  });

  test('Japanese text should send all characters', async ({ page }) => {
    const input = page.locator('#tui-input');

    // Type Japanese text
    const testString = 'echo あいうえお';
    await input.fill(testString);

    const inputValue = await input.inputValue();
    console.log(`Input value: "${inputValue}"`);
    expect(inputValue).toBe(testString);

    // Press Enter to send
    await input.press('Enter');

    await page.waitForTimeout(2000);

    // Check terminal output - use .xterm-rows for actual text
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    console.log('Terminal content:', terminalContent?.substring(0, 500));

    // Should contain the full Japanese text
    expect(terminalContent).toContain('あいうえお');
  });

  test('multiple sends should all preserve first character', async ({ page }) => {
    const input = page.locator('#tui-input');

    const testStrings = [
      'echo TEST1_abc',
      'echo TEST2_def',
      'echo TEST3_ghi'
    ];

    for (const testString of testStrings) {
      await input.fill(testString);
      await input.press('Enter');
      await page.waitForTimeout(1500);
    }

    // Use .xterm-rows for actual terminal text
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    console.log('Terminal content:', terminalContent?.substring(0, 500));

    // All test strings should appear in output
    expect(terminalContent).toContain('TEST1_abc');
    expect(terminalContent).toContain('TEST2_def');
    expect(terminalContent).toContain('TEST3_ghi');
  });

  test('first character not lost - detailed check', async ({ page }) => {
    const input = page.locator('#tui-input');

    // Test patterns where first character loss would be obvious
    // If first character is lost:
    // - "Aあいう" becomes "あいう" (A lost)
    // - "1234" becomes "234" (1 lost)
    // - "hello" becomes "ello" (h lost)
    const testCases = [
      { input: 'A_first_char_test', shouldContain: 'A_first_char_test' },
      { input: '1_number_start', shouldContain: '1_number_start' },
      { input: 'あ_jp_start', shouldContain: 'あ_jp_start' },
    ];

    for (const tc of testCases) {
      await input.fill(tc.input);
      const filled = await input.inputValue();
      console.log(`Input filled: "${filled}"`);

      // The input should have the full text including first character
      expect(filled).toBe(tc.input);
      expect(filled[0]).toBe(tc.input[0]); // First char should be preserved

      await input.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Check terminal content includes all test patterns with first characters intact
    const terminalContent = await page.locator('.xterm-rows').first().textContent();
    console.log('Terminal content (last 500):', terminalContent?.slice(-500));

    for (const tc of testCases) {
      expect(terminalContent).toContain(tc.shouldContain);
    }
  });
});
