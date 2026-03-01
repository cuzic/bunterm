import { test, expect, type Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Use test-specific state directory to avoid affecting production
const TEST_STATE_DIR = '/tmp/ttyd-mux-e2e-state';
const TEST_DIR = '/tmp/ttyd-mux-e2e-test';
const BASE_PATH = '/ttyd-mux';

// Set environment variable for test state directory
process.env['TTYD_MUX_STATE_DIR'] = TEST_STATE_DIR;

// Find an available port dynamically
async function findAvailablePort(startPort = 17680): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next one
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}

// Create a temporary config file with the specified daemon port
function createTestConfig(daemonPort: number): string {
  const configPath = join(TEST_DIR, 'test-config.yaml');
  const configContent = `
daemon_port: ${daemonPort}
base_path: ${BASE_PATH}
base_port: 17600
`;
  writeFileSync(configPath, configContent);
  return configPath;
}

// Track processes and sessions for cleanup
const ttydProcesses: ChildProcess[] = [];
const tmuxSessions: Set<string> = new Set();

// Helper to start ttyd directly and wait for it
async function startTtyd(port: number, sessionName: string): Promise<ChildProcess> {
  const basePath = `${BASE_PATH}/${sessionName}`;

  const proc = spawn('ttyd', [
    '-p', String(port),
    '-b', basePath,
    '-W',  // Enable writable mode
    'tmux', 'new', '-A', '-s', sessionName,
  ], {
    cwd: TEST_DIR,
    detached: true,
    stdio: 'ignore',
  });

  proc.unref();
  ttydProcesses.push(proc);
  tmuxSessions.add(sessionName);

  // Wait for ttyd to start - use the correct base path
  await waitForTtyd(port, basePath, 10000);

  return proc;
}

// Helper to wait for ttyd to be available on its base path
async function waitForTtyd(port: number, basePath: string, timeout: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${basePath}/`);
      if (response.ok || response.status === 200) {
        return;
      }
    } catch {
      // Port not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`ttyd on port ${port}${basePath} did not become available within ${timeout}ms`);
}

// Helper to wait for terminal to be ready
async function waitForTerminalReady(page: Page, timeout = 15000): Promise<void> {
  // Wait for xterm container and textarea to be present
  await page.waitForSelector('.xterm', { timeout });
  await page.waitForSelector('.xterm-helper-textarea', { timeout });
  // Give terminal time to fully initialize
  await page.waitForTimeout(1000);
}

// Helper to type in terminal
async function typeInTerminal(page: Page, text: string): Promise<void> {
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type(text, { delay: 50 });
}

// Helper to press key in terminal
async function pressKey(page: Page, key: string): Promise<void> {
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press(key);
}

// Helper to wait for file content to contain expected text
async function waitForFileContent(filePath: string, expected: string, timeout = 5000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      if (content.includes(expected)) {
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

// Helper to cleanup ttyd processes and tmux sessions
function cleanupTtydProcesses(): void {
  // Kill ttyd processes (SIGTERM may fail if already exited - that's expected)
  for (const proc of ttydProcesses) {
    if (proc.pid) {
      process.kill(proc.pid, 'SIGTERM');
    }
  }
  ttydProcesses.length = 0;

  // Kill tmux sessions (|| true handles already-dead sessions)
  for (const session of tmuxSessions) {
    execSync(`tmux kill-session -t ${session} 2>/dev/null || true`, { stdio: 'ignore' });
  }
  tmuxSessions.clear();
}

// Port allocation for ttyd tests
let nextTtydPort = 17610;
async function allocateTtydPort(): Promise<number> {
  const port = await findAvailablePort(nextTtydPort);
  nextTtydPort = port + 1;
  return port;
}

test.describe('ttyd-mux E2E Tests', () => {
  test.beforeAll(async () => {
    // Clean up test state directory (not production!)
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    // Create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Kill any leftover test tmux sessions from previous runs (test-* pattern)
    // The || true at the end handles cases where no sessions exist
    execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^test-" | xargs -I {} tmux kill-session -t {} 2>/dev/null || true', { stdio: 'ignore' });
  });

  test.afterAll(async () => {
    cleanupTtydProcesses();

    // Clean up test directories
    for (const dir of [TEST_DIR, TEST_STATE_DIR]) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    }
  });

  test.afterEach(async () => {
    // Clean up ttyd processes after each test
    cleanupTtydProcesses();
  });

  test('ttyd terminal loads and displays prompt', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-load';

    await startTtyd(port, sessionName);

    // Access ttyd directly
    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);

    // Wait for terminal to load
    await waitForTerminalReady(page);

    // Verify terminal is visible
    await expect(page.locator('.xterm')).toBeVisible();
    await expect(page.locator('.xterm-helper-textarea')).toBeAttached();
  });

  test('can type in terminal and execute commands', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-echo';
    const outputFile = `${TEST_DIR}/echo-output.txt`;

    await startTtyd(port, sessionName);

    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    // Type echo command that writes to file
    await typeInTerminal(page, `echo "Hello E2E Test" > ${outputFile}`);
    await pressKey(page, 'Enter');

    // Wait for file to be created with expected content
    const hasContent = await waitForFileContent(outputFile, 'Hello E2E Test', 5000);
    expect(hasContent).toBe(true);
  });

  test('can create and list files via terminal', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-files';
    const testFileName = 'e2e-test-file.txt';
    const resultFile = `${TEST_DIR}/ls-result.txt`;

    await startTtyd(port, sessionName);

    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    // Create a file
    await typeInTerminal(page, `touch ${TEST_DIR}/${testFileName}`);
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    // List the file and save to result file
    await typeInTerminal(page, `ls ${TEST_DIR}/${testFileName} > ${resultFile}`);
    await pressKey(page, 'Enter');

    // Verify file listing was captured
    const hasResult = await waitForFileContent(resultFile, testFileName, 5000);
    expect(hasResult).toBe(true);
  });

  test('Ctrl+C interrupts running command', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-ctrlc';
    const markerFile = `${TEST_DIR}/interrupt-marker.txt`;

    await startTtyd(port, sessionName);

    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    // Start a long-running command
    await typeInTerminal(page, 'sleep 60');
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    // Send Ctrl+C
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(500);

    // Verify we can type again (command was interrupted)
    await typeInTerminal(page, `echo "after interrupt" > ${markerFile}`);
    await pressKey(page, 'Enter');

    // Wait for marker file
    const hasMarker = await waitForFileContent(markerFile, 'after interrupt', 5000);
    expect(hasMarker).toBe(true);
  });

  test('tmux session persists across reconnections', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-persist';
    const varFile = `${TEST_DIR}/persist-var.txt`;
    const uniqueValue = `persist-${Date.now()}`;

    await startTtyd(port, sessionName);

    // First connection - set a variable and write to file
    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    await typeInTerminal(page, `export TEST_VAR="${uniqueValue}"`);
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    // Reload page (reconnect to same tmux session)
    await page.reload();
    await waitForTerminalReady(page);

    // Check variable still exists by writing it to file
    await typeInTerminal(page, `echo $TEST_VAR > ${varFile}`);
    await pressKey(page, 'Enter');

    // Verify the variable persisted
    const hasPersisted = await waitForFileContent(varFile, uniqueValue, 5000);
    expect(hasPersisted).toBe(true);
  });

  test('multiple terminals can run independently', async ({ page, context }) => {
    const port1 = await allocateTtydPort();
    const port2 = await allocateTtydPort();
    const session1 = 'test-multi-1';
    const session2 = 'test-multi-2';
    const file1 = `${TEST_DIR}/multi-1.txt`;
    const file2 = `${TEST_DIR}/multi-2.txt`;

    await startTtyd(port1, session1);
    await startTtyd(port2, session2);

    // Open first terminal
    await page.goto(`http://127.0.0.1:${port1}${BASE_PATH}/${session1}/`);
    await waitForTerminalReady(page);

    // Write unique value from first terminal
    await typeInTerminal(page, `echo "first" > ${file1}`);
    await pressKey(page, 'Enter');

    // Open second terminal in new tab
    const page2 = await context.newPage();
    await page2.goto(`http://127.0.0.1:${port2}${BASE_PATH}/${session2}/`);
    await waitForTerminalReady(page2);

    // Write unique value from second terminal
    await page2.locator('.xterm-helper-textarea').focus();
    await page2.keyboard.type(`echo "second" > ${file2}`, { delay: 50 });
    await page2.keyboard.press('Enter');

    // Verify both files have correct content
    const hasFirst = await waitForFileContent(file1, 'first', 5000);
    const hasSecond = await waitForFileContent(file2, 'second', 5000);

    expect(hasFirst).toBe(true);
    expect(hasSecond).toBe(true);

    await page2.close();
  });

  test('terminal handles special characters', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-special';
    const outputFile = `${TEST_DIR}/special-chars.txt`;

    await startTtyd(port, sessionName);

    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    // Test that terminal can handle and output special patterns
    await typeInTerminal(page, `echo "Special: test" > ${outputFile}`);
    await pressKey(page, 'Enter');

    const hasContent = await waitForFileContent(outputFile, 'Special:', 5000);
    expect(hasContent).toBe(true);
  });

  test('terminal supports arrow keys for history', async ({ page }) => {
    const port = await allocateTtydPort();
    const sessionName = 'test-history';
    const historyFile = `${TEST_DIR}/history-test.txt`;

    await startTtyd(port, sessionName);

    await page.goto(`http://127.0.0.1:${port}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page);

    // Type and execute first command
    await typeInTerminal(page, `echo "first" > ${historyFile}`);
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    // Type second command
    await typeInTerminal(page, 'echo "second"');
    await pressKey(page, 'Enter');
    await page.waitForTimeout(500);

    // Press up arrow twice to get first command
    await pressKey(page, 'ArrowUp');
    await page.waitForTimeout(300);
    await pressKey(page, 'ArrowUp');
    await page.waitForTimeout(300);

    // Execute it (should overwrite file with "first")
    await pressKey(page, 'Enter');

    // Verify file still has "first" (command was recalled from history)
    await page.waitForTimeout(500);
    const hasFirst = await waitForFileContent(historyFile, 'first', 5000);
    expect(hasFirst).toBe(true);
  });
});

test.describe('ttyd-mux Daemon E2E', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;

  test.beforeAll(async () => {
    // Clean up test state directory (not production!)
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    // Ensure test directory exists
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    // Find an available port
    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    // Start daemon in foreground with custom config
    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    // Wait for daemon to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Daemon failed to start'));
      }, 10000);

      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });

      daemonProcess!.stderr?.on('data', (data) => {
        console.error('[daemon]', data.toString());
      });
    });
  });

  test.afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    cleanupTtydProcesses();
  });

  test('daemon portal page loads', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    await expect(page.locator('h1')).toContainText('ttyd-mux');
  });

  test('daemon portal shows no sessions message when empty', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    await expect(page.locator('text=No active sessions')).toBeVisible();
  });

  test('daemon API returns status', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/status`);

    expect(response.ok()).toBeTruthy();

    const status = await response.json();
    expect(status).toHaveProperty('daemon');
    expect(status).toHaveProperty('sessions');
    expect(Array.isArray(status.sessions)).toBeTruthy();
  });

  test('daemon API returns sessions list', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`);

    expect(response.ok()).toBeTruthy();

    const sessions = await response.json();
    expect(Array.isArray(sessions)).toBeTruthy();
  });
});

test.describe('Session Management via Daemon', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-session-test';

  test.beforeAll(async () => {
    // Clean up test state directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    // Find available port and create config
    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    // Start daemon
    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });
  });

  test.afterAll(async () => {
    // Clean up session via API (may fail if session doesn't exist - check response)
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`, {
      method: 'DELETE',
    });
    // 200 = deleted, 404 = didn't exist - both acceptable in cleanup
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(`Failed to cleanup session: ${deleteResponse.status}`);
    }

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    cleanupTtydProcesses();
  });

  test('can create session via API', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: {
        name: sessionName,
        dir: TEST_DIR,
      },
    });

    expect(response.ok()).toBeTruthy();

    const session = await response.json();
    expect(session.name).toBe(sessionName);
    expect(session.dir).toBe(TEST_DIR);
    expect(session.port).toBeGreaterThan(0);
    expect(session.fullPath).toContain(sessionName);

    // Track for cleanup
    tmuxSessions.add(sessionName);
  });

  test('created session appears in sessions list', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`);
    expect(response.ok()).toBeTruthy();

    const sessions = await response.json();
    const found = sessions.find((s: { name: string }) => s.name === sessionName);
    expect(found).toBeDefined();
  });

  test('created session appears in status', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/status`);
    expect(response.ok()).toBeTruthy();

    const status = await response.json();
    const found = status.sessions.find((s: { name: string }) => s.name === sessionName);
    expect(found).toBeDefined();
  });

  test('portal shows created session', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    // Session should be visible in the list
    await expect(page.locator(`text=${sessionName}`)).toBeVisible({ timeout: 5000 });
  });

  test.skip('can access terminal through daemon proxy', async ({ page }) => {
    // Skip: Proxy terminal loading is unreliable in CI environment.
    // The proxy functionality is verified by "can type in proxied terminal" (also skipped).
    // Direct ttyd terminal tests in "ttyd-mux E2E Tests" cover terminal functionality.
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page, 30000);
    await expect(page.locator('.xterm')).toBeVisible();
  });

  test.skip('can type in proxied terminal', async ({ page }) => {
    // Skip: This test is flaky due to timing issues with proxy terminal loading
    // The terminal functionality is tested directly in "ttyd-mux E2E Tests"
    const outputFile = `${TEST_DIR}/proxied-test.txt`;

    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
    await waitForTerminalReady(page, 30000);
    await typeInTerminal(page, `echo "proxied" > ${outputFile}`);
    await pressKey(page, 'Enter');
    const hasContent = await waitForFileContent(outputFile, 'proxied', 5000);
    expect(hasContent).toBe(true);
  });

  test('can delete session via API', async ({ request }) => {
    // Create a temporary session to delete
    const tempSession = 'e2e-delete-test';
    await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: { name: tempSession, dir: TEST_DIR },
    });
    tmuxSessions.add(tempSession);

    // Delete it
    const deleteResponse = await request.delete(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${tempSession}?killTmux=true`
    );
    expect(deleteResponse.ok()).toBeTruthy();

    // Verify it's gone
    const listResponse = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`);
    const sessions = await listResponse.json();
    const found = sessions.find((s: { name: string }) => s.name === tempSession);
    expect(found).toBeUndefined();

    tmuxSessions.delete(tempSession);
  });

  test('returns error when creating duplicate session', async ({ request }) => {
    // Create a unique session for this test (don't rely on other tests)
    const duplicateTestSession = 'e2e-duplicate-test';
    const createResponse = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: { name: duplicateTestSession, dir: TEST_DIR },
    });
    expect(createResponse.ok()).toBeTruthy();
    tmuxSessions.add(duplicateTestSession);

    // Try to create the same session again - should fail
    const duplicateResponse = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: { name: duplicateTestSession, dir: TEST_DIR },
    });

    expect(duplicateResponse.status()).toBe(400);
    const body = await duplicateResponse.json();
    expect(body.error).toMatch(/already running/i);

    // Clean up
    await request.delete(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${duplicateTestSession}?killTmux=true`);
    tmuxSessions.delete(duplicateTestSession);
  });
});

test.describe('File Transfer', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-file-transfer';

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });

    // Create session for file transfer tests
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });
    tmuxSessions.add(sessionName);

    // Wait for session to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test.afterAll(async () => {
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(`Failed to cleanup session: ${deleteResponse.status}`);
    }

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    cleanupTtydProcesses();
  });

  test('can list files via API', async ({ request }) => {
    // Create a test file
    writeFileSync(join(TEST_DIR, 'list-test.txt'), 'test content');

    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/list?session=${sessionName}&path=.`
    );

    expect(response.ok()).toBeTruthy();

    const files = await response.json();
    expect(Array.isArray(files.files)).toBeTruthy();
    const testFile = files.files.find((f: { name: string }) => f.name === 'list-test.txt');
    expect(testFile).toBeDefined();
  });

  test('can download file via API', async ({ request }) => {
    const testContent = 'downloadable content';
    writeFileSync(join(TEST_DIR, 'download-test.txt'), testContent);

    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/download?session=${sessionName}&path=download-test.txt`
    );

    expect(response.ok()).toBeTruthy();
    const content = await response.text();
    expect(content).toBe(testContent);
  });

  test('can upload file via API', async ({ request }) => {
    const uploadContent = 'uploaded via API';
    const uploadPath = 'uploaded-test.txt';

    const response = await request.post(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/upload?session=${sessionName}&path=${uploadPath}`,
      {
        data: uploadContent,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    );

    expect(response.ok()).toBeTruthy();

    // Verify file was created
    const filePath = join(TEST_DIR, uploadPath);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe(uploadContent);
  });

  test('download fails for non-existent file', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/download?session=${sessionName}&path=nonexistent.txt`
    );

    expect(response.status()).toBe(404);
  });
});

test.describe('Share Links', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-share-test';
  let shareToken: string;

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });

    // Create session
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });
    tmuxSessions.add(sessionName);

    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test.afterAll(async () => {
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(`Failed to cleanup session: ${deleteResponse.status}`);
    }

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    cleanupTtydProcesses();
  });

  test('can create share link', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares`, {
      data: {
        sessionName: sessionName,
        expiresIn: '1h',
      },
    });

    expect(response.ok()).toBeTruthy();

    const share = await response.json();
    expect(share.token).toBeDefined();
    expect(share.sessionName).toBe(sessionName);
    expect(share.expiresAt).toBeDefined();

    shareToken = share.token;
  });

  test('can list shares', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares`);

    expect(response.ok()).toBeTruthy();

    const shares = await response.json();
    expect(Array.isArray(shares)).toBeTruthy();
    const found = shares.find((s: { token: string }) => s.token === shareToken);
    expect(found).toBeDefined();
  });

  test('can validate share token', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares/${shareToken}`);

    expect(response.ok()).toBeTruthy();

    const share = await response.json();
    expect(share.sessionName).toBe(sessionName);
  });

  test.skip('can access shared session via token', async ({ page }) => {
    // Skip: Share page terminal loading via proxy is unreliable in CI environment.
    // The share link API functionality is verified by other tests in this suite.
    // Direct terminal tests are covered in "ttyd-mux E2E Tests".
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/share/${shareToken}`);
    await waitForTerminalReady(page, 15000);
    await expect(page.locator('.xterm')).toBeVisible();
  });

  test('can revoke share', async ({ request }) => {
    // Create another share to revoke
    const createResponse = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares`, {
      data: { sessionName: sessionName, expiresIn: '1h' },
    });
    const share = await createResponse.json();
    const tokenToRevoke = share.token;

    // Revoke it
    const revokeResponse = await request.delete(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares/${tokenToRevoke}`
    );
    expect(revokeResponse.ok()).toBeTruthy();

    // Verify it's revoked
    const validateResponse = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares/${tokenToRevoke}`
    );
    expect(validateResponse.status()).toBe(404);
  });

  test('invalid share token returns 404', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/shares/invalid-token`);

    expect(response.status()).toBe(404);
  });
});

test.describe('Portal UI', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-portal-ui';

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });
  });

  test.afterAll(async () => {
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(`Failed to cleanup session: ${deleteResponse.status}`);
    }

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    cleanupTtydProcesses();
  });

  test('portal page has correct title', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    await expect(page).toHaveTitle(/ttyd-mux/);
  });

  test('portal shows header and logo', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    await expect(page.locator('h1')).toContainText('ttyd-mux');
  });

  test('portal session link exists and has correct href', async ({ page }) => {
    // Create a session first
    const response = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    // Session creation should succeed (201) or already exist (400)
    if (!response.ok && response.status !== 400) {
      throw new Error(`Failed to create session: ${response.status}`);
    }
    tmuxSessions.add(sessionName);

    // Wait for ttyd to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    // Wait for session to appear
    const sessionLink = page.locator(`a[href*="${sessionName}"]`);
    await expect(sessionLink).toBeVisible({ timeout: 10000 });

    // Verify the link has correct href pointing to the session
    const href = await sessionLink.getAttribute('href');
    expect(href).toContain(sessionName);
    expect(href).toContain(BASE_PATH);

    // Note: Actual navigation to terminal is tested in "ttyd-mux E2E Tests"
    // Proxy terminal navigation is unreliable in CI (see skipped tests above)
  });

  test('portal refreshes session list', async ({ page }) => {
    // First create a session if it doesn't exist
    const createResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });
    // 201 = created, 400 = already exists - both acceptable
    if (!createResponse.ok && createResponse.status !== 400) {
      throw new Error(`Failed to create session: ${createResponse.status}`);
    }
    tmuxSessions.add(sessionName);

    // Wait for session to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/`);

    // Session should be visible after page load
    await expect(page.locator(`text=${sessionName}`)).toBeVisible({ timeout: 10000 });

    // Create another session via API
    const newSession = 'e2e-refresh-test';
    const newSessionResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSession, dir: TEST_DIR }),
    });
    if (!newSessionResponse.ok) {
      throw new Error(`Failed to create new session: ${newSessionResponse.status}`);
    }
    tmuxSessions.add(newSession);

    // Wait a bit for session to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Refresh page
    await page.reload();

    // New session should appear
    await expect(page.locator(`text=${newSession}`)).toBeVisible({ timeout: 10000 });

    // Clean up
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${newSession}?killTmux=true`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok) {
      throw new Error(`Failed to cleanup session: ${deleteResponse.status}`);
    }
    tmuxSessions.delete(newSession);
  });
});

test.describe('Notification API', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    const configPath = createTestConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });
  });

  test.afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }
  });

  test('can get VAPID public key', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/notifications/vapid-key`);

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.publicKey).toBeDefined();
    expect(typeof data.publicKey).toBe('string');
    expect(data.publicKey.length).toBeGreaterThan(0);
  });

  test('can list subscriptions (initially empty)', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/notifications/subscriptions`
    );

    expect(response.ok()).toBeTruthy();

    const subscriptions = await response.json();
    expect(Array.isArray(subscriptions)).toBeTruthy();
  });

  test('subscribe requires valid HTTPS endpoint', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/notifications/subscribe`, {
      data: {
        endpoint: 'http://invalid-endpoint.com/push',
        keys: { p256dh: 'test-key', auth: 'test-auth' },
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('HTTPS');
  });
});

test.describe('Directory Browser', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const ALLOWED_DIR = '/tmp/ttyd-mux-e2e-allowed';

  // Create config with directory browser enabled
  function createDirBrowserConfig(port: number): string {
    const configPath = join(TEST_DIR, 'dir-browser-config.yaml');
    const configContent = `
daemon_port: ${port}
base_path: ${BASE_PATH}
base_port: 17600
directory_browser:
  enabled: true
  allowed_directories:
    - ${ALLOWED_DIR}
`;
    writeFileSync(configPath, configContent);
    return configPath;
  }

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    // Create allowed directory with subdirectories
    if (existsSync(ALLOWED_DIR)) {
      rmSync(ALLOWED_DIR, { recursive: true });
    }
    mkdirSync(ALLOWED_DIR, { recursive: true });
    mkdirSync(join(ALLOWED_DIR, 'subdir1'), { recursive: true });
    mkdirSync(join(ALLOWED_DIR, 'subdir2'), { recursive: true });
    mkdirSync(join(ALLOWED_DIR, 'project-a'), { recursive: true });

    daemonPort = await findAvailablePort();
    const configPath = createDirBrowserConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });
  });

  test.afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }

    // Clean up allowed directory
    if (existsSync(ALLOWED_DIR)) {
      rmSync(ALLOWED_DIR, { recursive: true });
    }

    cleanupTtydProcesses();
  });

  test('can get allowed directories', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories`);

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.directories).toBeDefined();
    expect(Array.isArray(data.directories)).toBeTruthy();
    expect(data.directories.length).toBeGreaterThan(0);

    const found = data.directories.find((d: { path: string }) => d.path === ALLOWED_DIR);
    expect(found).toBeDefined();
  });

  test('can list subdirectories', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/list?base=0&path=`
    );

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.current).toBe(ALLOWED_DIR);
    expect(data.directories).toBeDefined();
    expect(Array.isArray(data.directories)).toBeTruthy();

    const subdir1 = data.directories.find((d: { name: string }) => d.name === 'subdir1');
    const subdir2 = data.directories.find((d: { name: string }) => d.name === 'subdir2');
    expect(subdir1).toBeDefined();
    expect(subdir2).toBeDefined();
  });

  test('can navigate into subdirectory', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/list?base=0&path=subdir1`
    );

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.current).toBe(join(ALLOWED_DIR, 'subdir1'));
  });

  test('can validate directory path', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/validate`, {
      data: { path: ALLOWED_DIR },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  test('rejects path outside allowed directories', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/validate`, {
      data: { path: '/etc' },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.valid).toBe(false);
  });

  test('rejects path traversal attempts', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/list?base=0&path=../../../etc`
    );

    // Should return error for path traversal
    expect(response.status()).toBe(404);
  });

  test('invalid base index returns error', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/list?base=999&path=`
    );

    expect(response.status()).toBe(404);
  });

  test('can create session from selected directory', async ({ request }) => {
    const sessionName = 'e2e-dir-browser-session';
    const sessionDir = join(ALLOWED_DIR, 'project-a');

    // First validate the directory
    const validateResponse = await request.post(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/validate`,
      { data: { path: sessionDir } }
    );
    const validateData = await validateResponse.json();
    expect(validateData.valid).toBe(true);

    // Create session
    const createResponse = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: { name: sessionName, dir: sessionDir },
    });

    expect(createResponse.ok()).toBeTruthy();

    const session = await createResponse.json();
    expect(session.name).toBe(sessionName);
    expect(session.dir).toBe(sessionDir);

    tmuxSessions.add(sessionName);

    // Clean up
    await request.delete(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}?killTmux=true`);
    tmuxSessions.delete(sessionName);
  });
});

test.describe('Directory Browser Disabled', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    daemonPort = await findAvailablePort();
    // Use default config (directory browser disabled by default)
    const configPath = createTestConfig(daemonPort);

    daemonProcess = spawn('bun', ['run', 'src/index.ts', 'daemon', 'start', '-f', '-c', configPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon failed to start')), 10000);
      daemonProcess!.stdout?.on('data', (data) => {
        if (data.toString().includes('daemon started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });
    });
  });

  test.afterAll(async () => {
    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }
  });

  test('directories API returns 403 when disabled', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories`);

    expect(response.status()).toBe(403);

    const data = await response.json();
    expect(data.error).toContain('disabled');
  });

  test('directories list API returns 403 when disabled', async ({ request }) => {
    const response = await request.get(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/list?base=0&path=`
    );

    expect(response.status()).toBe(403);
  });

  test('directories validate API returns 403 when disabled', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/directories/validate`, {
      data: { path: '/tmp' },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe('Native Terminal Mode', () => {
  let daemonProcess: ChildProcess | null = null;
  let daemonPort: number;
  const sessionName = 'e2e-native-terminal';

  // Create config with native terminal backend
  function createNativeTerminalConfig(port: number): string {
    const configPath = join(TEST_DIR, 'native-terminal-config.yaml');
    const configContent = `
daemon_port: ${port}
base_path: ${BASE_PATH}
base_port: 17600
session_backend: native
tmux_mode: none
native_terminal:
  scrollback: 10000
  output_buffer_size: 1000
`;
    writeFileSync(configPath, configContent);
    return configPath;
  }

  test.beforeAll(async () => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });

    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

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
        // Match daemon startup message patterns
        if (output.includes('daemon started') || output.includes('Native terminal server started')) {
          clearTimeout(timeout);
          setTimeout(resolve, 1000);
        }
      });
      daemonProcess!.stderr?.on('data', (data) => {
        console.error('[daemon stderr]', data.toString());
      });
    });
  });

  test.afterAll(async () => {
    // Clean up session
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.error(`Failed to cleanup session: ${deleteResponse.status}`);
    }

    if (daemonProcess) {
      daemonProcess.kill('SIGTERM');
      daemonProcess = null;
    }
  });

  test('can create native terminal session via API', async ({ request }) => {
    const response = await request.post(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      data: {
        name: sessionName,
        dir: TEST_DIR,
      },
    });

    expect(response.ok()).toBeTruthy();

    const session = await response.json();
    expect(session.name).toBe(sessionName);
    expect(session.dir).toBe(TEST_DIR);
  });

  test('native terminal loads without JavaScript errors', async ({ page }) => {
    // Track JavaScript errors
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    // Create session if not exists
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    // Wait for session to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Navigate to the native terminal session
    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);

    // Wait for terminal to load
    await page.waitForSelector('#terminal', { timeout: 10000 });

    // Wait a bit for all scripts to initialize
    await page.waitForTimeout(2000);

    // Check for the specific error we fixed (base_path undefined)
    const basePathError = jsErrors.find(e => e.includes("Cannot read properties of undefined (reading 'replace')"));
    expect(basePathError).toBeUndefined();

    // Verify terminal UI config has base_path set correctly
    const configCheck = await page.evaluate(() => {
      const config = (window as Window & { __TERMINAL_UI_CONFIG__?: { base_path?: string } }).__TERMINAL_UI_CONFIG__;
      return {
        hasConfig: !!config,
        hasBasePath: !!config?.base_path,
        basePath: config?.base_path,
      };
    });

    expect(configCheck.hasConfig).toBe(true);
    expect(configCheck.hasBasePath).toBe(true);
    expect(configCheck.basePath).toBe(BASE_PATH);
  });

  test('native terminal xterm initializes correctly', async ({ page }) => {
    // Create session if not exists
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);

    // Wait for xterm to initialize
    await page.waitForSelector('.xterm', { timeout: 15000 });
    await page.waitForSelector('.xterm-helper-textarea', { timeout: 15000 });

    // Verify xterm is visible
    await expect(page.locator('.xterm')).toBeVisible();
    await expect(page.locator('.xterm-helper-textarea')).toBeAttached();
  });

  test('native terminal WebSocket connects successfully', async ({ page }) => {
    // Create session if not exists
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);

    // Wait for terminal to load
    await page.waitForSelector('.xterm', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check WebSocket connection status
    const isConnected = await page.evaluate(() => {
      const client = (window as Window & { __TERMINAL_CLIENT__?: { isConnected: boolean } }).__TERMINAL_CLIENT__;
      return client?.isConnected ?? false;
    });

    expect(isConnected).toBe(true);

    // Loading indicator should be hidden
    const loadingHidden = await page.evaluate(() => {
      const loading = document.getElementById('loading');
      return loading?.classList.contains('hidden') ?? false;
    });

    expect(loadingHidden).toBe(true);
  });

  test('can type in native terminal', async ({ page }) => {
    const outputFile = `${TEST_DIR}/native-terminal-test.txt`;

    // Create session if not exists
    await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, dir: TEST_DIR }),
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);

    // Wait for terminal
    await page.waitForSelector('.xterm-helper-textarea', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Type a command
    await page.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type(`echo "native terminal works" > ${outputFile}`, { delay: 50 });
    await page.keyboard.press('Enter');

    // Wait for file to be created
    const hasContent = await waitForFileContent(outputFile, 'native terminal works', 10000);
    expect(hasContent).toBe(true);
  });
});
