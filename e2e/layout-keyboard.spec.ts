/**
 * Layout tests for keyboard visibility scenarios
 *
 * Tests the LayoutManager's handling of viewport changes when keyboard is shown/hidden.
 */

import { test, expect, type Page, devices } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

const TEST_STATE_DIR = '/tmp/bunterm-e2e-layout-state';
const TEST_DIR = '/tmp/bunterm-e2e-layout-test';
const BASE_PATH = '/bunterm';

process.env['BUNTERM_STATE_DIR'] = TEST_STATE_DIR;

async function findAvailablePort(startPort = 18990): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}

function createConfig(port: number): string {
  const configPath = join(TEST_DIR, 'layout-test-config.yaml');
  const configContent = `
daemon_port: ${port}
base_path: ${BASE_PATH}
base_port: 18900
session_backend: native
tmux_mode: none
native_terminal:
  scrollback: 10000
  output_buffer_size: 1000
`;
  writeFileSync(configPath, configContent);
  return configPath;
}

// Helper to get layout metrics including CSS variables
async function getLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const toolbar = document.getElementById('tui');
    const terminal = document.getElementById('terminal');
    const xterm = document.querySelector('.xterm') as HTMLElement;

    // Get CSS variables
    const style = getComputedStyle(root);
    const vvh = style.getPropertyValue('--vvh');
    const tuiH = style.getPropertyValue('--tui-h');
    const vvOffsetTop = style.getPropertyValue('--vv-offset-top');

    // Get actual dimensions
    const toolbarRect = toolbar?.getBoundingClientRect();
    const terminalRect = terminal?.getBoundingClientRect();
    const xtermRect = xterm?.getBoundingClientRect();

    // Get viewport info
    const vv = window.visualViewport;

    return {
      // CSS variables
      cssVvh: vvh,
      cssTuiH: tuiH,
      cssVvOffsetTop: vvOffsetTop,
      // Viewport
      innerHeight: window.innerHeight,
      visualViewportHeight: vv?.height ?? null,
      visualViewportOffsetTop: vv?.offsetTop ?? null,
      // Elements
      toolbarHidden: toolbar?.classList.contains('hidden') ?? true,
      toolbarHeight: toolbarRect?.height ?? 0,
      toolbarTop: toolbarRect?.top ?? 0,
      toolbarBottom: toolbarRect?.bottom ?? 0,
      terminalHeight: terminalRect?.height ?? 0,
      terminalTop: terminalRect?.top ?? 0,
      terminalBottom: terminalRect?.bottom ?? 0,
      xtermHeight: xtermRect?.height ?? 0,
      // Computed heights
      terminalComputedHeight: terminal ? getComputedStyle(terminal).height : null,
      bodyComputedHeight: getComputedStyle(document.body).height,
      // Gap analysis
      gapAtBottom: window.innerHeight - (terminalRect?.bottom ?? 0),
      expectedTerminalHeight: toolbar?.classList.contains('hidden')
        ? window.innerHeight
        : window.innerHeight - (toolbarRect?.height ?? 0),
    };
  });
}

// Use mobile device emulation
test.use({
  ...devices['iPhone 12'],
  hasTouch: true,
});

test.describe('Layout with Keyboard', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-layout-test';

  test.beforeAll(async () => {
    for (const dir of [TEST_STATE_DIR, TEST_DIR]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
      mkdirSync(dir, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    const configPath = createConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 15000);
      daemonProcess!.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('daemon started') || output.includes('Native terminal server started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 1000);
        }
      });
      daemonProcess!.stderr?.on('data', (data) => {
        console.error('[daemon stderr]', data.toString());
      });
    });

    // Create session
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test.afterAll(async () => {
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}`, {
      method: 'DELETE',
    }).catch(() => {});

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    for (const dir of [TEST_DIR, TEST_STATE_DIR]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    }
  });

  test('verify CSS variables are set correctly', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const metrics = await getLayoutMetrics(page);
    console.log('=== CSS Variables Check ===');
    console.log(JSON.stringify(metrics, null, 2));

    // Verify CSS variables are set
    expect(metrics.cssVvh).not.toBe('');
    expect(metrics.cssTuiH).not.toBe('');

    // Parse values
    const vvhPx = parseInt(metrics.cssVvh || '0');
    const tuiHPx = parseInt(metrics.cssTuiH || '0');

    console.log('Parsed values:', { vvhPx, tuiHPx });

    // vvh should match innerHeight (or visualViewport.height)
    expect(vvhPx).toBe(metrics.innerHeight);

    // tuiH should match toolbar height when visible
    if (!metrics.toolbarHidden) {
      expect(tuiHPx).toBeCloseTo(metrics.toolbarHeight, 0);
    }
  });

  test('toolbar visible: terminal fills viewport minus toolbar', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const metrics = await getLayoutMetrics(page);
    console.log('=== Toolbar Visible ===');
    console.log(JSON.stringify(metrics, null, 2));

    expect(metrics.toolbarHidden).toBe(false);

    // Terminal should fill space above toolbar
    const expectedHeight = metrics.innerHeight - metrics.toolbarHeight;
    const actualHeight = metrics.terminalHeight;
    const diff = Math.abs(expectedHeight - actualHeight);

    console.log(`Expected: ${expectedHeight}, Actual: ${actualHeight}, Diff: ${diff}`);

    // Allow 5px tolerance
    expect(diff).toBeLessThan(5);

    // No gap at bottom (toolbar should be at bottom)
    expect(metrics.gapAtBottom).toBeLessThan(5);
  });

  test('toolbar hidden: terminal fills full viewport', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    const metrics = await getLayoutMetrics(page);
    console.log('=== Toolbar Hidden ===');
    console.log(JSON.stringify(metrics, null, 2));

    expect(metrics.toolbarHidden).toBe(true);

    // Terminal should fill full viewport
    const expectedHeight = metrics.innerHeight;
    const actualHeight = metrics.terminalHeight;
    const diff = Math.abs(expectedHeight - actualHeight);

    console.log(`Expected: ${expectedHeight}, Actual: ${actualHeight}, Diff: ${diff}`);

    // Allow 5px tolerance
    expect(diff).toBeLessThan(5);

    // No gap at bottom
    expect(metrics.gapAtBottom).toBeLessThan(5);
  });

  test('simulate keyboard by reducing viewport height', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('=== BEFORE RESIZE (Full Height) ===');
    const beforeMetrics = await getLayoutMetrics(page);
    console.log(JSON.stringify(beforeMetrics, null, 2));

    // Simulate keyboard by reducing viewport height (from 844 to ~400)
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(500);

    console.log('=== AFTER RESIZE (Simulated Keyboard) ===');
    const afterMetrics = await getLayoutMetrics(page);
    console.log(JSON.stringify(afterMetrics, null, 2));

    // CSS variables should update
    const newVvh = parseInt(afterMetrics.cssVvh || '0');
    expect(newVvh).toBe(400);

    // Terminal should fill the reduced viewport minus toolbar
    const expectedHeight = 400 - afterMetrics.toolbarHeight;
    const actualHeight = afterMetrics.terminalHeight;
    const diff = Math.abs(expectedHeight - actualHeight);

    console.log(`Expected: ${expectedHeight}, Actual: ${actualHeight}, Diff: ${diff}`);
    expect(diff).toBeLessThan(5);

    // No gap at bottom
    expect(afterMetrics.gapAtBottom).toBeLessThan(5);
  });

  test('simulate keyboard with toolbar hidden', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Hide toolbar first
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== TOOLBAR HIDDEN, FULL HEIGHT ===');
    const beforeMetrics = await getLayoutMetrics(page);
    console.log(JSON.stringify(beforeMetrics, null, 2));

    // Simulate keyboard
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(500);

    console.log('=== TOOLBAR HIDDEN, SIMULATED KEYBOARD ===');
    const afterMetrics = await getLayoutMetrics(page);
    console.log(JSON.stringify(afterMetrics, null, 2));

    // CSS variables should update
    const newVvh = parseInt(afterMetrics.cssVvh || '0');
    const newTuiH = parseInt(afterMetrics.cssTuiH || '0');
    expect(newVvh).toBe(400);
    expect(newTuiH).toBe(0); // Toolbar hidden

    // Terminal should fill full viewport
    const expectedHeight = 400;
    const actualHeight = afterMetrics.terminalHeight;
    const diff = Math.abs(expectedHeight - actualHeight);

    console.log(`Expected: ${expectedHeight}, Actual: ${actualHeight}, Diff: ${diff}`);
    expect(diff).toBeLessThan(5);

    // No gap at bottom
    expect(afterMetrics.gapAtBottom).toBeLessThan(5);
  });

  test('state transitions: full height -> keyboard -> full height', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Initial state
    console.log('=== STATE 1: Full Height, Toolbar Visible ===');
    const state1 = await getLayoutMetrics(page);
    console.log(JSON.stringify(state1, null, 2));
    expect(state1.gapAtBottom).toBeLessThan(5);

    // Show keyboard (reduce viewport)
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(500);

    console.log('=== STATE 2: Keyboard Shown, Toolbar Visible ===');
    const state2 = await getLayoutMetrics(page);
    console.log(JSON.stringify(state2, null, 2));
    expect(state2.gapAtBottom).toBeLessThan(5);

    // Hide keyboard (restore viewport)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    console.log('=== STATE 3: Full Height Again, Toolbar Visible ===');
    const state3 = await getLayoutMetrics(page);
    console.log(JSON.stringify(state3, null, 2));
    expect(state3.gapAtBottom).toBeLessThan(5);

    // Terminal height should return to original
    const diff = Math.abs(state3.terminalHeight - state1.terminalHeight);
    console.log(`Height diff from initial: ${diff}`);
    expect(diff).toBeLessThan(5);
  });

  test('state transitions with toolbar toggle', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Simulate keyboard
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(500);

    console.log('=== KEYBOARD + TOOLBAR VISIBLE ===');
    const withToolbar = await getLayoutMetrics(page);
    console.log(JSON.stringify(withToolbar, null, 2));
    expect(withToolbar.gapAtBottom).toBeLessThan(5);

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== KEYBOARD + TOOLBAR HIDDEN ===');
    const withoutToolbar = await getLayoutMetrics(page);
    console.log(JSON.stringify(withoutToolbar, null, 2));
    expect(withoutToolbar.gapAtBottom).toBeLessThan(5);

    // Terminal should expand when toolbar hidden
    expect(withoutToolbar.terminalHeight).toBeGreaterThan(withToolbar.terminalHeight);

    // Show toolbar again
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== KEYBOARD + TOOLBAR VISIBLE AGAIN ===');
    const finalState = await getLayoutMetrics(page);
    console.log(JSON.stringify(finalState, null, 2));
    expect(finalState.gapAtBottom).toBeLessThan(5);

    // Should return to same height as initial
    const diff = Math.abs(finalState.terminalHeight - withToolbar.terminalHeight);
    expect(diff).toBeLessThan(5);
  });

  test('debug: check what causes gap at bottom', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Hide toolbar and reduce viewport
    await page.click('#tui-toggle');
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForTimeout(500);

    const debugInfo = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const terminal = document.getElementById('terminal');
      const xterm = document.querySelector('.xterm') as HTMLElement;
      const xtermViewport = document.querySelector('.xterm-viewport') as HTMLElement;
      const toolbar = document.getElementById('tui');

      const rootStyle = getComputedStyle(root);
      const bodyStyle = getComputedStyle(body);
      const terminalStyle = terminal ? getComputedStyle(terminal) : null;
      const xtermStyle = xterm ? getComputedStyle(xterm) : null;

      return {
        // CSS variables
        vvh: rootStyle.getPropertyValue('--vvh'),
        tuiH: rootStyle.getPropertyValue('--tui-h'),
        // Dimensions
        innerHeight: window.innerHeight,
        // Root/Body
        rootHeight: root.getBoundingClientRect().height,
        bodyHeight: body.getBoundingClientRect().height,
        bodyComputedHeight: bodyStyle.height,
        bodyPadding: bodyStyle.padding,
        bodyMargin: bodyStyle.margin,
        // Terminal
        terminalHeight: terminal?.getBoundingClientRect().height,
        terminalComputedHeight: terminalStyle?.height,
        terminalTop: terminal?.getBoundingClientRect().top,
        terminalBottom: terminal?.getBoundingClientRect().bottom,
        // Xterm
        xtermHeight: xterm?.getBoundingClientRect().height,
        xtermComputedHeight: xtermStyle?.height,
        xtermPadding: xtermStyle?.padding,
        // Xterm viewport
        xtermViewportHeight: xtermViewport?.getBoundingClientRect().height,
        // Toolbar
        toolbarHidden: toolbar?.classList.contains('hidden'),
        // Check if CSS :has() is supported
        hasSupported: CSS.supports('selector(:has(*))'),
        // Check body classes
        bodyClasses: body.className,
        // Check which CSS rule is matching
        terminalInlineStyle: terminal?.getAttribute('style'),
      };
    });

    console.log('=== DEBUG INFO ===');
    console.log(JSON.stringify(debugInfo, null, 2));

    // Check for discrepancies
    const vvh = parseInt(debugInfo.vvh || '0');
    const terminalHeight = debugInfo.terminalHeight || 0;

    console.log(`\nExpected terminal height: ${vvh}`);
    console.log(`Actual terminal height: ${terminalHeight}`);
    console.log(`Difference: ${vvh - terminalHeight}`);

    if (vvh !== terminalHeight) {
      console.log('\nPOSSIBLE ISSUES:');
      if (debugInfo.terminalComputedHeight !== `${vvh}px`) {
        console.log(`- CSS not applying correctly. Computed: ${debugInfo.terminalComputedHeight}, Expected: ${vvh}px`);
      }
      if (!debugInfo.hasSupported) {
        console.log('- :has() selector not supported!');
      }
      if (debugInfo.xtermPadding !== '0px') {
        console.log(`- xterm has padding: ${debugInfo.xtermPadding}`);
      }
    }
  });
});
