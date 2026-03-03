import { test, expect, type Page, devices } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Use test-specific state directory
const TEST_STATE_DIR = '/tmp/ttyd-mux-e2e-toolbar-state';
const TEST_DIR = '/tmp/ttyd-mux-e2e-toolbar-test';
const BASE_PATH = '/ttyd-mux';

process.env['TTYD_MUX_STATE_DIR'] = TEST_STATE_DIR;

async function findAvailablePort(startPort = 18880): Promise<number> {
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

function createNativeTerminalConfig(port: number): string {
  const configPath = join(TEST_DIR, 'toolbar-test-config.yaml');
  const configContent = `
daemon_port: ${port}
base_path: ${BASE_PATH}
base_port: 18800
session_backend: native
tmux_mode: none
native_terminal:
  scrollback: 10000
  output_buffer_size: 1000
`;
  writeFileSync(configPath, configContent);
  return configPath;
}

// Helper to get viewport and terminal metrics
async function getTerminalMetrics(page: Page): Promise<{
  viewportHeight: number;
  toolbarVisible: boolean;
  toolbarHeight: number;
  terminalContainerHeight: number;
  xtermHeight: number;
  xtermRows: number;
  spaceUsed: number;
  hiddenSpace: number;
}> {
  return page.evaluate(() => {
    const toolbar = document.getElementById('tui');
    const toolbarVisible = toolbar ? !toolbar.classList.contains('hidden') : false;
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarHeight = toolbarVisible && toolbarRect ? toolbarRect.height : 0;

    const terminalContainer = document.getElementById('terminal') ||
                              document.querySelector('.terminal') ||
                              document.querySelector('.terminal-pane');
    const terminalRect = terminalContainer?.getBoundingClientRect();
    const terminalContainerHeight = terminalRect?.height || 0;

    const xterm = document.querySelector('.xterm') as HTMLElement;
    const xtermRect = xterm?.getBoundingClientRect();
    const xtermHeight = xtermRect?.height || 0;

    const term = (window as Window & { term?: { rows?: number } }).term;
    const xtermRows = term?.rows || 0;

    const viewportHeight = window.innerHeight;
    const spaceUsed = toolbarHeight + terminalContainerHeight;
    const hiddenSpace = viewportHeight - (terminalRect?.bottom || 0);

    return {
      viewportHeight,
      toolbarVisible,
      toolbarHeight,
      terminalContainerHeight,
      xtermHeight,
      xtermRows,
      spaceUsed,
      hiddenSpace,
    };
  });
}

// Helper to get detailed element positions
async function getElementPositions(page: Page): Promise<{
  toolbarBottom: number;
  terminalTop: number;
  terminalBottom: number;
  viewportHeight: number;
  xtermViewportHeight: number;
}> {
  return page.evaluate(() => {
    const toolbar = document.getElementById('tui');
    const toolbarRect = toolbar?.getBoundingClientRect();

    const terminalContainer = document.getElementById('terminal') ||
                              document.querySelector('.terminal') ||
                              document.querySelector('.terminal-pane');
    const terminalRect = terminalContainer?.getBoundingClientRect();

    const xtermViewport = document.querySelector('.xterm-viewport') as HTMLElement;
    const xtermViewportRect = xtermViewport?.getBoundingClientRect();

    return {
      toolbarBottom: toolbarRect?.bottom || 0,
      terminalTop: terminalRect?.top || 0,
      terminalBottom: terminalRect?.bottom || 0,
      viewportHeight: window.innerHeight,
      xtermViewportHeight: xtermViewportRect?.height || 0,
    };
  });
}

// Use mobile device emulation
test.use({
  ...devices['iPhone 12'],
  hasTouch: true,
});

test.describe('Toolbar Resize - Mobile', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-toolbar-test';

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    daemonPort = await findAvailablePort();
    const configPath = createNativeTerminalConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 15000);
      daemonProcess!.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log('[daemon stdout]', output);
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

  test('terminal loads and toolbar is visible by default', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const metrics = await getTerminalMetrics(page);
    console.log('Initial metrics:', JSON.stringify(metrics, null, 2));

    expect(metrics.toolbarVisible).toBe(true);
    expect(metrics.toolbarHeight).toBeGreaterThan(0);
    expect(metrics.terminalContainerHeight).toBeGreaterThan(0);
    expect(metrics.xtermRows).toBeGreaterThan(0);
  });

  test('debug: terminal dimensions with toolbar visible', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const metrics = await getTerminalMetrics(page);
    const positions = await getElementPositions(page);

    console.log('=== TOOLBAR VISIBLE ===');
    console.log('Metrics:', JSON.stringify(metrics, null, 2));
    console.log('Positions:', JSON.stringify(positions, null, 2));

    // Check if terminal bottom extends beyond viewport
    const isOverflowing = positions.terminalBottom > positions.viewportHeight;
    console.log('Terminal overflowing viewport:', isOverflowing);

    // Check if there's hidden space at the bottom
    const hiddenPixels = positions.terminalBottom - positions.viewportHeight;
    console.log('Hidden pixels at bottom:', hiddenPixels);

    // Expected: terminal should NOT overflow
    expect(isOverflowing).toBe(false);
  });

  test('debug: terminal dimensions after hiding toolbar', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('=== BEFORE HIDING TOOLBAR ===');
    const beforeMetrics = await getTerminalMetrics(page);
    const beforePositions = await getElementPositions(page);
    console.log('Metrics:', JSON.stringify(beforeMetrics, null, 2));
    console.log('Positions:', JSON.stringify(beforePositions, null, 2));

    // Hide toolbar by clicking toggle button
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== AFTER HIDING TOOLBAR ===');
    const afterMetrics = await getTerminalMetrics(page);
    const afterPositions = await getElementPositions(page);
    console.log('Metrics:', JSON.stringify(afterMetrics, null, 2));
    console.log('Positions:', JSON.stringify(afterPositions, null, 2));

    // Toolbar should be hidden
    expect(afterMetrics.toolbarVisible).toBe(false);

    // Terminal should expand to fill the screen
    // terminalContainerHeight should increase by roughly toolbarHeight
    const heightIncrease = afterMetrics.terminalContainerHeight - beforeMetrics.terminalContainerHeight;
    console.log('Height increase after hiding toolbar:', heightIncrease);
    console.log('Expected height increase (toolbar height):', beforeMetrics.toolbarHeight);

    // xterm rows should increase
    console.log('Rows before:', beforeMetrics.xtermRows);
    console.log('Rows after:', afterMetrics.xtermRows);

    // Terminal should fill most of the viewport when toolbar is hidden
    expect(afterMetrics.terminalContainerHeight).toBeGreaterThan(beforeMetrics.terminalContainerHeight);
  });

  test('debug: terminal dimensions after showing toolbar again', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const initialMetrics = await getTerminalMetrics(page);
    console.log('=== INITIAL STATE (toolbar visible) ===');
    console.log('Metrics:', JSON.stringify(initialMetrics, null, 2));

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    const hiddenMetrics = await getTerminalMetrics(page);
    console.log('=== AFTER HIDING TOOLBAR ===');
    console.log('Metrics:', JSON.stringify(hiddenMetrics, null, 2));

    // Show toolbar again
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    const finalMetrics = await getTerminalMetrics(page);
    console.log('=== AFTER SHOWING TOOLBAR AGAIN ===');
    console.log('Metrics:', JSON.stringify(finalMetrics, null, 2));

    // Terminal should shrink back when toolbar is shown
    expect(finalMetrics.terminalContainerHeight).toBeLessThan(hiddenMetrics.terminalContainerHeight);

    // Terminal should be same size as initial (within margin of error)
    const sizeDiff = Math.abs(finalMetrics.terminalContainerHeight - initialMetrics.terminalContainerHeight);
    console.log('Size difference from initial:', sizeDiff);
    expect(sizeDiff).toBeLessThan(10); // Allow 10px tolerance

    // Terminal bottom should not exceed viewport
    const positions = await getElementPositions(page);
    const isOverflowing = positions.terminalBottom > positions.viewportHeight;
    console.log('Terminal overflowing after showing toolbar:', isOverflowing);
    console.log('Terminal bottom:', positions.terminalBottom, 'Viewport height:', positions.viewportHeight);
    expect(isOverflowing).toBe(false);
  });

  test('debug: CSS applied classes during toggle', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check initial CSS computed styles
    const getComputedHeights = () => page.evaluate(() => {
      const toolbar = document.getElementById('tui');
      const terminalContainer = document.getElementById('terminal') ||
                                document.querySelector('.terminal') ||
                                document.querySelector('.terminal-pane');
      const body = document.body;

      return {
        toolbarClasses: toolbar?.className || '',
        bodyPaddingBottom: window.getComputedStyle(body).paddingBottom,
        terminalComputedHeight: terminalContainer ?
          window.getComputedStyle(terminalContainer as Element).height : 'N/A',
        terminalInlineHeight: (terminalContainer as HTMLElement)?.style.height || 'none',
      };
    });

    console.log('=== CSS STATE: TOOLBAR VISIBLE ===');
    console.log(JSON.stringify(await getComputedHeights(), null, 2));

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== CSS STATE: TOOLBAR HIDDEN ===');
    console.log(JSON.stringify(await getComputedHeights(), null, 2));

    // Show toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    console.log('=== CSS STATE: TOOLBAR VISIBLE AGAIN ===');
    console.log(JSON.stringify(await getComputedHeights(), null, 2));
  });

  test('debug: check xterm fit calls', async ({ page }) => {
    // Track fit addon calls
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Inject fit tracking
    await page.evaluate(() => {
      const fitAddon = (window as Window & { fitAddon?: { fit: () => void } }).fitAddon;
      if (fitAddon) {
        const originalFit = fitAddon.fit.bind(fitAddon);
        (window as Window & { __fitCallCount?: number }).__fitCallCount = 0;
        fitAddon.fit = () => {
          (window as Window & { __fitCallCount?: number }).__fitCallCount =
            ((window as Window & { __fitCallCount?: number }).__fitCallCount || 0) + 1;
          console.log('[DEBUG] fitAddon.fit() called, count:', (window as Window & { __fitCallCount?: number }).__fitCallCount);
          originalFit();
        };
      }
    });

    // Toggle toolbar and check fit calls
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    const fitCountAfterHide = await page.evaluate(() =>
      (window as Window & { __fitCallCount?: number }).__fitCallCount || 0
    );
    console.log('Fit calls after hiding toolbar:', fitCountAfterHide);

    // Show again
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    const fitCountAfterShow = await page.evaluate(() =>
      (window as Window & { __fitCallCount?: number }).__fitCallCount || 0
    );
    console.log('Fit calls after showing toolbar:', fitCountAfterShow);

    // Fit should be called during toggle
    expect(fitCountAfterShow).toBeGreaterThan(fitCountAfterHide);

    // Check debug logs
    const fitLogs = consoleLogs.filter(l => l.includes('fit') || l.includes('Fit'));
    console.log('Fit-related logs:', fitLogs);
  });

  test('FIX TEST: verify terminal does not overflow when toolbar is visible', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Initial state
    const initialMetrics = await getTerminalMetrics(page);
    const initialPositions = await getElementPositions(page);

    console.log('=== INITIAL STATE ===');
    console.log('Viewport height:', initialPositions.viewportHeight);
    console.log('Toolbar bottom:', initialPositions.toolbarBottom);
    console.log('Terminal top:', initialPositions.terminalTop);
    console.log('Terminal bottom:', initialPositions.terminalBottom);

    // Check for overflow
    const isOverflowing = initialPositions.terminalBottom > initialPositions.viewportHeight;

    if (isOverflowing) {
      console.log('PROBLEM: Terminal bottom exceeds viewport by:',
        initialPositions.terminalBottom - initialPositions.viewportHeight, 'px');

      // Try to diagnose the issue
      const cssInfo = await page.evaluate(() => {
        const toolbar = document.getElementById('tui');
        const terminalContainer = document.getElementById('terminal') ||
                                  document.querySelector('.terminal') ||
                                  document.querySelector('.terminal-pane');

        const toolbarStyles = toolbar ? window.getComputedStyle(toolbar) : null;
        const containerStyles = terminalContainer ?
          window.getComputedStyle(terminalContainer as Element) : null;

        return {
          toolbarPosition: toolbarStyles?.position,
          toolbarBottom: toolbarStyles?.bottom,
          toolbarHeight: toolbarStyles?.height,
          containerHeight: containerStyles?.height,
          containerPosition: containerStyles?.position,
          hasSelector: CSS.supports('selector(:has(*))'),
        };
      });

      console.log('CSS diagnostic info:', JSON.stringify(cssInfo, null, 2));
    }

    // This assertion will fail if there's an overflow - that's the bug we're debugging
    expect(isOverflowing).toBe(false);
  });

  test('FIX TEST: verify terminal expands/shrinks correctly on toggle', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Get initial row count
    const initialRows = await page.evaluate(() => {
      const term = (window as Window & { term?: { rows?: number } }).term;
      return term?.rows || 0;
    });
    console.log('Initial rows with toolbar:', initialRows);

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    // Get rows after hiding
    const rowsAfterHide = await page.evaluate(() => {
      const term = (window as Window & { term?: { rows?: number } }).term;
      return term?.rows || 0;
    });
    console.log('Rows after hiding toolbar:', rowsAfterHide);

    // Rows should INCREASE when toolbar is hidden (more vertical space)
    expect(rowsAfterHide).toBeGreaterThan(initialRows);

    // Show toolbar again
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    // Get final row count
    const finalRows = await page.evaluate(() => {
      const term = (window as Window & { term?: { rows?: number } }).term;
      return term?.rows || 0;
    });
    console.log('Final rows after showing toolbar:', finalRows);

    // Rows should return to initial value
    expect(finalRows).toBe(initialRows);
  });

  test('FIX TEST: verify terminal and toolbar do not overlap', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await page.waitForSelector('#terminal .xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check for overlap
    const checkOverlap = async () => {
      return page.evaluate(() => {
        const toolbar = document.getElementById('tui');
        const terminalContainer = document.getElementById('terminal') ||
                                  document.querySelector('.terminal') ||
                                  document.querySelector('.terminal-pane');

        if (!toolbar || !terminalContainer) {
          return { error: 'Elements not found' };
        }

        const toolbarRect = toolbar.getBoundingClientRect();
        const terminalRect = terminalContainer.getBoundingClientRect();
        const toolbarVisible = !toolbar.classList.contains('hidden');

        // Calculate overlap
        const toolbarTop = toolbarVisible ? toolbarRect.top : window.innerHeight;
        const terminalBottom = terminalRect.bottom;
        const overlap = terminalBottom > toolbarTop ? terminalBottom - toolbarTop : 0;

        return {
          viewportHeight: window.innerHeight,
          toolbarVisible,
          toolbarTop,
          toolbarHeight: toolbarRect.height,
          terminalTop: terminalRect.top,
          terminalBottom,
          terminalHeight: terminalRect.height,
          overlap,
          computedTerminalHeight: window.getComputedStyle(terminalContainer as Element).height,
          inlineTerminalHeight: (terminalContainer as HTMLElement).style.height,
        };
      });
    };

    // Check with toolbar visible
    const withToolbar = await checkOverlap();
    console.log('=== WITH TOOLBAR VISIBLE ===');
    console.log(JSON.stringify(withToolbar, null, 2));

    // Verify no overlap (allow 1px tolerance for subpixel rounding)
    expect(withToolbar.overlap).toBeLessThan(1);

    // The terminal bottom should be exactly at or before toolbar top
    if (withToolbar.toolbarVisible) {
      expect(withToolbar.terminalBottom).toBeLessThanOrEqual(withToolbar.toolbarTop + 1); // 1px tolerance
    }

    // Hide toolbar
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    // Check with toolbar hidden
    const withoutToolbar = await checkOverlap();
    console.log('=== WITH TOOLBAR HIDDEN ===');
    console.log(JSON.stringify(withoutToolbar, null, 2));

    // Terminal should expand to full viewport
    expect(withoutToolbar.terminalHeight).toBeGreaterThanOrEqual(withoutToolbar.viewportHeight - 10); // 10px tolerance

    // Show toolbar again
    await page.click('#tui-toggle');
    await page.waitForTimeout(500);

    // Check after showing again
    const afterToggle = await checkOverlap();
    console.log('=== AFTER SHOWING TOOLBAR AGAIN ===');
    console.log(JSON.stringify(afterToggle, null, 2));

    // Verify no overlap after toggle (allow 1px tolerance for subpixel rounding)
    expect(afterToggle.overlap).toBeLessThan(1);
    expect(afterToggle.terminalBottom).toBeLessThanOrEqual(afterToggle.toolbarTop + 1); // 1px tolerance
  });
});
