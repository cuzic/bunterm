/**
 * Feature UI E2E Tests
 *
 * Tests for toolbar feature UI interactions:
 * - File transfer (download/upload modal)
 * - Preview pane
 * - Search functionality
 * - Notifications
 * - Share links
 * - Clipboard operations
 * - Snippet manager
 * - Session switcher
 * - Toolbar toggle
 */

import { test, expect, type Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Test directories
const TEST_STATE_DIR = '/tmp/bunterm-e2e-features-state';
const TEST_DIR = '/tmp/bunterm-e2e-features';
const BASE_PATH = '/bunterm';

// Set environment variable for test state directory
process.env['BUNTERM_STATE_DIR'] = TEST_STATE_DIR;

// Track tmux sessions for cleanup
const tmuxSessions: Set<string> = new Set();

// Shared daemon process
let daemonProcess: ChildProcess | null = null;
let daemonPort: number;
const sessionName = 'e2e-features-test';

// Find an available port dynamically
async function findAvailablePort(startPort = 18680): Promise<number> {
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

// Create a temporary config file
function createTestConfig(port: number): string {
  const configPath = join(TEST_DIR, 'test-config.yaml');
  const configContent = `
daemon_port: ${port}
base_path: ${BASE_PATH}
native_terminal:
  scrollback: 1000
terminal_ui:
  font_size_default_pc: 14
  font_size_default_mobile: 12
preview:
  enabled: true
  default_width: 400
notifications:
  enabled: true
  bell_notification: true
`;
  writeFileSync(configPath, configContent);
  return configPath;
}

// Helper to wait for terminal to be ready
async function waitForTerminalReady(page: Page, timeout = 15000): Promise<void> {
  await page.waitForSelector('.xterm', { timeout });
  await page.waitForSelector('.xterm-helper-textarea', { timeout });
  await page.waitForTimeout(1000);
}

// Helper to type in terminal
async function typeInTerminal(page: Page, text: string): Promise<void> {
  await page.locator('#terminal .xterm-helper-textarea').focus();
  await page.keyboard.type(text, { delay: 50 });
}

// Helper to press key in terminal
async function pressKey(page: Page, key: string): Promise<void> {
  await page.locator('#terminal .xterm-helper-textarea').focus();
  await page.keyboard.press(key);
}

// Helper to ensure toolbar is visible and not minimized
async function ensureToolbarVisible(page: Page): Promise<void> {
  const toolbar = page.locator('#tui');

  // Show toolbar if hidden
  const isHidden = await toolbar.evaluate(el => el.classList.contains('hidden'));
  if (isHidden) {
    await page.click('#tui-toggle');
    await page.waitForTimeout(200);
  }

  // Expand toolbar if minimized
  const isMinimized = await toolbar.evaluate(el => el.classList.contains('minimized'));
  if (isMinimized) {
    await page.click('#tui-minimize');
    await page.waitForTimeout(200);
  }
}

// Cleanup tmux sessions
function cleanupTmuxSessions(): void {
  for (const session of tmuxSessions) {
    execSync(`tmux kill-session -t ${session} 2>/dev/null || true`, { stdio: 'ignore' });
  }
  tmuxSessions.clear();
}

// Get base URL for tests
function getBaseUrl(): string {
  return `http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`;
}

// ============================================================================
// Global Setup / Teardown
// ============================================================================

test.beforeAll(async () => {
  // Setup test directories
  for (const dir of [TEST_STATE_DIR, TEST_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
    mkdirSync(dir, { recursive: true });
  }

  // Create test files
  writeFileSync(join(TEST_DIR, 'test-file.txt'), 'Hello World');
  writeFileSync(join(TEST_DIR, 'readme.md'), '# Test');
  writeFileSync(join(TEST_DIR, 'index.html'), '<html><body><h1>Test Page</h1></body></html>');
  mkdirSync(join(TEST_DIR, 'subdir'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'subdir', 'nested.txt'), 'Nested content');

  // Kill any leftover test tmux sessions
  execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^e2e-" | xargs -I {} tmux kill-session -t {} 2>/dev/null || true', { stdio: 'ignore' });

  // Start daemon
  daemonPort = await findAvailablePort();
  const configPath = createTestConfig(daemonPort);

  daemonProcess = spawn('bun', ['run', 'src/index.ts', 'start', '-f', '-c', configPath], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 20000);
    daemonProcess!.stdout?.on('data', (data) => {
      const str = data.toString();
      if (str.includes('daemon started') || str.includes('Server listening')) {
        clearTimeout(timeout);
        setTimeout(resolve, 1500);
      }
    });
    daemonProcess!.stderr?.on('data', (data) => {
      console.error('[daemon stderr]', data.toString());
    });
  });

  // Create session
  const response = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }
  tmuxSessions.add(sessionName);

  // Wait for session to be fully ready
  await new Promise(resolve => setTimeout(resolve, 3000));
});

test.afterAll(async () => {
  // Cleanup session
  await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`, {
    method: 'DELETE',
  }).catch(() => {});

  if (daemonProcess) {
    daemonProcess.kill('SIGTERM');
    daemonProcess = null;
  }

  cleanupTmuxSessions();

  // Cleanup directories
  for (const dir of [TEST_DIR, TEST_STATE_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  }
});

// ============================================================================
// File Transfer UI Tests
// ============================================================================

test.describe('File Transfer UI', () => {
  test('download button opens file browser modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-download');
    await expect(page.locator('#tui-file-modal')).toBeVisible();
    await expect(page.locator('#tui-file-modal-title')).toContainText('ファイルブラウザ');
  });

  test('file browser shows files in directory', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-download');
    await expect(page.locator('#tui-file-modal')).toBeVisible();
    await page.waitForTimeout(500);

    const fileList = page.locator('#tui-file-list');
    await expect(fileList).toContainText('test-file.txt');
    await expect(fileList).toContainText('readme.md');
    await expect(fileList).toContainText('subdir');
  });

  test('can navigate into subdirectory', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-download');
    await expect(page.locator('#tui-file-modal')).toBeVisible();
    await page.waitForTimeout(500);

    await page.click('#tui-file-list >> text=subdir');
    await page.waitForTimeout(500);

    await expect(page.locator('#tui-file-list')).toContainText('nested.txt');
    await expect(page.locator('#tui-file-breadcrumb')).toContainText('subdir');
  });

  test('can close file browser modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-download');
    await expect(page.locator('#tui-file-modal')).toBeVisible();

    await page.click('#tui-file-modal-close');
    await expect(page.locator('#tui-file-modal')).toBeHidden();
  });

  test('upload button and file input exist', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-upload')).toBeVisible();
    await expect(page.locator('#tui-file-upload-input')).toBeAttached();
  });
});

// ============================================================================
// Search Functionality Tests
// ============================================================================

test.describe('Search Functionality', () => {
  test('search button toggles search bar', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-search-bar')).toBeHidden();
    await page.click('#tui-search');
    await expect(page.locator('#tui-search-bar')).toBeVisible();
    await expect(page.locator('#tui-search-input')).toBeFocused();
  });

  test('Ctrl+Shift+F toggles search bar', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.locator('#terminal .xterm-helper-textarea').focus();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Shift+F');
    await page.waitForTimeout(300);

    await expect(page.locator('#tui-search-bar')).toBeVisible();
  });

  test('can type in search input', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-search');
    await expect(page.locator('#tui-search-bar')).toBeVisible();

    await page.fill('#tui-search-input', 'test');
    await expect(page.locator('#tui-search-input')).toHaveValue('test');
  });

  test('search close button hides search bar', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-search');
    await expect(page.locator('#tui-search-bar')).toBeVisible();

    await page.click('#tui-search-close');
    await expect(page.locator('#tui-search-bar')).toBeHidden();
  });

  test('case sensitivity toggle works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-search');
    await expect(page.locator('#tui-search-bar')).toBeVisible();

    const caseBtn = page.locator('#tui-search-case');
    await expect(caseBtn).not.toHaveClass(/active/);

    await caseBtn.click();
    await expect(caseBtn).toHaveClass(/active/);

    await caseBtn.click();
    await expect(caseBtn).not.toHaveClass(/active/);
  });

  test('regex toggle works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-search');

    const regexBtn = page.locator('#tui-search-regex');
    await expect(regexBtn).not.toHaveClass(/active/);

    await regexBtn.click();
    await expect(regexBtn).toHaveClass(/active/);
  });
});

// ============================================================================
// Preview Pane Tests
// ============================================================================

test.describe('Preview Pane', () => {
  test('preview button toggles preview pane', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-preview-pane')).toBeHidden();
    await page.click('#tui-preview');
    await expect(page.locator('#tui-preview-pane')).toBeVisible();
  });

  test('preview pane has header and controls', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-preview');
    await expect(page.locator('#tui-preview-pane')).toBeVisible();

    await expect(page.locator('#tui-preview-header')).toBeVisible();
    await expect(page.locator('#tui-preview-refresh')).toBeVisible();
    await expect(page.locator('#tui-preview-select')).toBeVisible();
    await expect(page.locator('#tui-preview-close')).toBeVisible();
  });

  test('preview pane close button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-preview');
    await expect(page.locator('#tui-preview-pane')).toBeVisible();

    // Close file modal if it opened (preview opens file selector on first open)
    const fileModal = page.locator('#tui-file-modal');
    if (!(await fileModal.evaluate(el => el.classList.contains('hidden')))) {
      await page.click('#tui-file-modal-close');
      await page.waitForTimeout(200);
    }

    await page.click('#tui-preview-close');
    await expect(page.locator('#tui-preview-pane')).toBeHidden();
  });

  test('preview iframe exists', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-preview');
    await expect(page.locator('#tui-preview-pane')).toBeVisible();

    await expect(page.locator('#tui-preview-iframe')).toBeAttached();
  });

  test('preview opens file selector on first click', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    // Click preview button
    await page.click('#tui-preview');
    await page.waitForTimeout(500);

    // Should open file browser modal in preview select mode
    await expect(page.locator('#tui-file-modal')).toBeVisible();

    // Modal title should indicate preview mode
    const title = await page.locator('#tui-file-modal-title').textContent();
    console.log('File modal title:', title);
  });

  test('can select HTML file for preview', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    // Click preview button - this opens file selector
    await page.click('#tui-preview');
    await page.waitForTimeout(500);

    // File modal should be visible
    await expect(page.locator('#tui-file-modal')).toBeVisible();

    // Wait for file list to load
    await page.waitForTimeout(500);

    // Check if index.html is in the list
    const fileList = page.locator('#tui-file-list');
    const hasIndexHtml = await fileList.locator('text=index.html').count();
    console.log('Found index.html:', hasIndexHtml > 0);

    if (hasIndexHtml > 0) {
      // Click on index.html
      await fileList.locator('text=index.html').click();
      await page.waitForTimeout(500);

      // Preview pane should be visible with content
      await expect(page.locator('#tui-preview-pane')).toBeVisible();

      // Check iframe src
      const iframeSrc = await page.locator('#tui-preview-iframe').getAttribute('src');
      console.log('Preview iframe src:', iframeSrc);
      expect(iframeSrc).toContain('session=');
      expect(iframeSrc).toContain('path=');
    }
  });

  test('preview API returns correct response', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);

    // Test the preview API endpoint directly
    const response = await page.request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/preview/file?session=${sessionName}&path=index.html`
    );

    console.log('Preview API status:', response.status());
    const text = await response.text();
    console.log('Preview API response:', text.substring(0, 200));

    expect(response.status()).toBe(200);
    expect(text).toContain('<h1>Test Page</h1>');
  });

  test('file list API returns correct response', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);

    // Test the file list API endpoint
    const response = await page.request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/list?session=${sessionName}&path=.`
    );

    console.log('Files API status:', response.status());
    const json = await response.json();
    console.log('Files API response:', JSON.stringify(json).substring(0, 300));

    expect(response.status()).toBe(200);
    expect(json.files).toBeDefined();
  });

  test('debug: check session name extraction', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);

    // Debug: check what session name is being extracted on client side
    const sessionNameOnClient = await page.evaluate(() => {
      const basePath = (window as any).__TERMINAL_UI_CONFIG__?.base_path;
      const pathname = window.location.pathname;
      console.log('basePath:', basePath);
      console.log('pathname:', pathname);

      // Extract session name
      const normalizedBase = (basePath || '').replace(/^\/|\/$/g, '');
      const pattern = new RegExp(`^/${normalizedBase}/([^/]+)`);
      const match = pathname.match(pattern);
      return {
        basePath,
        pathname,
        normalizedBase,
        match: match ? match[1] : null
      };
    });

    console.log('Session name debug:', sessionNameOnClient);
    expect(sessionNameOnClient.match).toBe(sessionName);
  });
});

// ============================================================================
// Share Links UI Tests
// ============================================================================

test.describe('Share Links UI', () => {
  test('share button opens share modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-share-modal')).toBeHidden();
    await page.click('#tui-share');
    await expect(page.locator('#tui-share-modal')).toBeVisible();
  });

  test('share modal has expiry options', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-share');
    await expect(page.locator('#tui-share-modal')).toBeVisible();

    await expect(page.locator('#tui-share-expiry-options')).toBeVisible();
    await expect(page.locator('input[name="tui-share-expiry"][value="1h"]')).toBeAttached();
    await expect(page.locator('input[name="tui-share-expiry"][value="24h"]')).toBeAttached();
    await expect(page.locator('input[name="tui-share-expiry"][value="7d"]')).toBeAttached();
  });

  test('share modal close button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-share');
    await expect(page.locator('#tui-share-modal')).toBeVisible();

    await page.click('#tui-share-modal-close');
    await expect(page.locator('#tui-share-modal')).toBeHidden();
  });

  test('create share link button exists', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-share');
    await expect(page.locator('#tui-share-modal')).toBeVisible();

    await expect(page.locator('#tui-share-create')).toBeVisible();
    await expect(page.locator('#tui-share-create')).toContainText('リンクを作成');
  });

  test('can create share link via UI', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-share');
    await expect(page.locator('#tui-share-modal')).toBeVisible();

    await page.click('#tui-share-create');
    await page.waitForTimeout(1500);

    await expect(page.locator('#tui-share-result')).toBeVisible();
    await expect(page.locator('#tui-share-url')).toBeVisible();

    const url = await page.locator('#tui-share-url').inputValue();
    expect(url).toContain('/share/');
  });
});

// ============================================================================
// Clipboard Operations Tests
// ============================================================================

test.describe('Clipboard Operations', () => {
  test('copy all button exists', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-copyall')).toBeVisible();
  });

  test('paste button exists', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-paste')).toBeVisible();
  });

  test('copy all button is clickable', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await typeInTerminal(page, 'echo "Test output for copy"');
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    await ensureToolbarVisible(page);
    await page.click('#tui-copyall');
    await expect(page.locator('#tui-copyall')).toBeEnabled();
  });
});

// ============================================================================
// Notification UI Tests
// ============================================================================

test.describe('Notification UI', () => {
  test('notification button exists', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-notify')).toBeVisible();
  });

  test('notification button is clickable', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-notify');
    await expect(page.locator('#tui-notify')).toBeVisible();
  });
});

// ============================================================================
// Snippet Manager UI Tests
// ============================================================================

test.describe('Snippet Manager UI', () => {
  test('snippet button opens snippet modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-snippet-modal')).toBeHidden();
    await page.click('#tui-snippet');
    await expect(page.locator('#tui-snippet-modal')).toBeVisible();
  });

  test('snippet modal has add button', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-snippet');
    await expect(page.locator('#tui-snippet-modal')).toBeVisible();

    await expect(page.locator('#tui-snippet-add')).toBeVisible();
  });

  test('snippet modal has search input', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-snippet');
    await expect(page.locator('#tui-snippet-modal')).toBeVisible();

    await expect(page.locator('#tui-snippet-search')).toBeVisible();
  });

  test('snippet modal close button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-snippet');
    await expect(page.locator('#tui-snippet-modal')).toBeVisible();

    await page.click('#tui-snippet-modal-close');
    await expect(page.locator('#tui-snippet-modal')).toBeHidden();
  });

  test('can open add snippet form', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-snippet');
    await expect(page.locator('#tui-snippet-modal')).toBeVisible();

    await page.click('#tui-snippet-add');

    await expect(page.locator('#tui-snippet-add-form')).toBeVisible();
    await expect(page.locator('#tui-snippet-add-name')).toBeVisible();
    await expect(page.locator('#tui-snippet-add-command')).toBeVisible();
  });
});

// ============================================================================
// Session Switcher UI Tests
// ============================================================================

test.describe('Session Switcher UI', () => {
  test('session button opens session modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-session-modal')).toBeHidden();
    await page.click('#tui-session');
    await expect(page.locator('#tui-session-modal')).toBeVisible();
  });

  test('Ctrl+K opens session modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.locator('#terminal .xterm-helper-textarea').focus();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);

    await expect(page.locator('#tui-session-modal')).toBeVisible();
  });

  test('session modal has search input', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-session');
    await expect(page.locator('#tui-session-modal')).toBeVisible();

    await expect(page.locator('#tui-session-search')).toBeVisible();
  });

  test('session modal shows current session', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-session');
    await expect(page.locator('#tui-session-modal')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page.locator('#tui-session-list')).toContainText(sessionName);
  });

  test('session modal close button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-session');
    await expect(page.locator('#tui-session-modal')).toBeVisible();

    await page.click('#tui-session-modal-close');
    await expect(page.locator('#tui-session-modal')).toBeHidden();
  });
});

// ============================================================================
// Toolbar Toggle Tests
// ============================================================================

test.describe('Toolbar Toggle', () => {
  test('Ctrl+; toggles toolbar visibility', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('#tui');
    await expect(toolbar).not.toHaveClass(/hidden/);

    await page.locator('#terminal .xterm-helper-textarea').focus();
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+;');
    await page.waitForTimeout(200);
    await expect(toolbar).toHaveClass(/hidden/);

    await page.keyboard.press('Control+;');
    await page.waitForTimeout(200);
    await expect(toolbar).not.toHaveClass(/hidden/);
  });

  test('toggle button shows/hides toolbar', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('#tui');
    const toggleBtn = page.locator('#tui-toggle');

    await expect(toolbar).not.toHaveClass(/hidden/);

    await toggleBtn.click();
    await page.waitForTimeout(200);
    await expect(toolbar).toHaveClass(/hidden/);

    await toggleBtn.click();
    await page.waitForTimeout(200);
    await expect(toolbar).not.toHaveClass(/hidden/);
  });

  test('minimize button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('#tui');

    await expect(toolbar).not.toHaveClass(/minimized/);

    // Minimize the toolbar
    await page.click('#tui-minimize');
    await page.waitForTimeout(200);
    await expect(toolbar).toHaveClass(/minimized/);

    // When minimized, the button might be hidden by CSS
    // Click using JavaScript since the button element still exists
    await page.evaluate(() => {
      const btn = document.getElementById('tui-minimize');
      btn?.click();
    });
    await page.waitForTimeout(200);
    await expect(toolbar).not.toHaveClass(/minimized/);
  });
});

// ============================================================================
// Quote Manager UI Tests
// ============================================================================

test.describe('Quote Manager UI', () => {
  test('quote button opens quote modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await expect(page.locator('#tui-quote-modal')).toBeHidden();
    await page.click('#tui-quote');
    await expect(page.locator('#tui-quote-modal')).toBeVisible();
  });

  test('quote modal has tabs', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-quote');
    await expect(page.locator('#tui-quote-modal')).toBeVisible();

    await expect(page.locator('#tui-quote-tabs')).toBeVisible();
    await expect(page.locator('.tui-quote-tab')).toHaveCount(4);
  });

  test('quote modal close button works', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.click('#tui-quote');
    await expect(page.locator('#tui-quote-modal')).toBeVisible();

    await page.click('#tui-quote-modal-close');
    await expect(page.locator('#tui-quote-modal')).toBeHidden();
  });

  test('Ctrl+Shift+Q opens quote modal', async ({ page }) => {
    await page.goto(getBaseUrl());
    await waitForTerminalReady(page);
    await ensureToolbarVisible(page);

    await page.locator('#terminal .xterm-helper-textarea').focus();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Shift+Q');
    await page.waitForTimeout(200);

    await expect(page.locator('#tui-quote-modal')).toBeVisible();
  });
});
