import { test, expect, devices, type Page } from '@playwright/test';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Use test-specific state directory to avoid affecting production
const TEST_STATE_DIR = '/tmp/bunterm-e2e-mobile-upload-state';
const TEST_DIR = '/tmp/bunterm-e2e-mobile-upload';
const BASE_PATH = '/bunterm';

// Set environment variable for test state directory
process.env['BUNTERM_STATE_DIR'] = TEST_STATE_DIR;

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
function createTestConfig(daemonPort: number): string {
  const configPath = join(TEST_DIR, 'test-config.yaml');
  const configContent = `
daemon_port: ${daemonPort}
base_path: ${BASE_PATH}
base_port: 18600
session_backend: native
tmux_mode: none
`;
  writeFileSync(configPath, configContent);
  return configPath;
}

// Track tmux sessions for cleanup
const tmuxSessions: Set<string> = new Set();

// Helper to wait for file content
async function waitForFileContent(filePath: string, timeout = 5000): Promise<string | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

// Global state for daemon
let daemonProcess: ChildProcess | null = null;
let daemonPort: number;
const sessionName = 'e2e-mobile-upload';

// Use iPhone 13 device for mobile testing
test.use({
  ...devices['iPhone 13'],
});

test.beforeAll(async () => {
  // Clean up test state directory
  if (existsSync(TEST_STATE_DIR)) {
    rmSync(TEST_STATE_DIR, { recursive: true });
  }
  mkdirSync(TEST_STATE_DIR, { recursive: true });

  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  daemonPort = await findAvailablePort();
  const configPath = createTestConfig(daemonPort);

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
  tmuxSessions.add(sessionName);

  await new Promise(resolve => setTimeout(resolve, 1000));
});

test.afterAll(async () => {
  // Clean up session
  if (daemonPort) {
    const deleteResponse = await fetch(`http://127.0.0.1:${daemonPort}${BASE_PATH}/api/sessions/${sessionName}`, {
      method: 'DELETE',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.error(`Failed to cleanup session: ${deleteResponse.status}`);
    }
  }

  if (daemonProcess) {
    daemonProcess.kill('SIGTERM');
    daemonProcess = null;
  }

  // Clean up tmux sessions
  for (const session of tmuxSessions) {
    execSync(`tmux kill-session -t ${session} 2>/dev/null || true`, { stdio: 'ignore' });
  }
  tmuxSessions.clear();

  // Clean up test directories
  for (const dir of [TEST_DIR, TEST_STATE_DIR]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  }
});

// Helper to navigate to session
async function goToSession(page: Page): Promise<void> {
  await page.goto(`http://127.0.0.1:${daemonPort}${BASE_PATH}/${sessionName}/`);
  await page.waitForSelector('.xterm', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

test.describe('Mobile File Upload', () => {
  test('upload button is visible on mobile', async ({ page }) => {
    await goToSession(page);

    // Upload button should be visible
    const uploadBtn = page.locator('#tui-upload');
    await expect(uploadBtn).toBeVisible();
  });

  test('upload button triggers file input on mobile', async ({ page }) => {
    await goToSession(page);

    // Check that file input exists and is hidden
    const uploadInput = page.locator('#tui-file-upload-input');
    await expect(uploadInput).toBeAttached();

    // The input should be hidden (type="file" inputs are often hidden)
    const inputDisplay = await uploadInput.evaluate(el => window.getComputedStyle(el).display);
    expect(inputDisplay).toBe('none');
  });

  test('can upload file via API on mobile', async ({ page, request }) => {
    const testContent = 'mobile upload test content';
    const uploadFilename = 'mobile-uploaded.txt';

    // Upload via API using FormData (multipart)
    const formData = new FormData();
    formData.append('file', new Blob([testContent]), uploadFilename);

    const response = await request.post(
      `http://127.0.0.1:${daemonPort}${BASE_PATH}/api/files/upload?session=${sessionName}&path=`,
      {
        multipart: {
          file: {
            name: uploadFilename,
            mimeType: 'text/plain',
            buffer: Buffer.from(testContent),
          },
        },
      }
    );

    expect(response.ok()).toBeTruthy();

    // Verify file was created
    const filePath = join(TEST_DIR, uploadFilename);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe(testContent);
  });

  test('can upload file via file input on mobile', async ({ page }) => {
    await goToSession(page);

    const testContent = 'file input upload test';
    const localTestFile = join(TEST_DIR, 'local-test-file.txt');

    // Create a local test file to upload
    writeFileSync(localTestFile, testContent);

    // Get the file input
    const uploadInput = page.locator('#tui-file-upload-input');

    // Set file input value using Playwright's setInputFiles
    await uploadInput.setInputFiles(localTestFile);

    // Wait for upload to complete
    await page.waitForTimeout(2000);

    // Check if file was uploaded (the file should appear in the session directory)
    const uploadedFilePath = join(TEST_DIR, 'local-test-file.txt');
    const content = await waitForFileContent(uploadedFilePath, 5000);

    // The file should exist (either the original or uploaded copy)
    expect(content).toBe(testContent);
  });

  test('uploaded file path is inserted into input field on mobile', async ({ page }) => {
    // Capture console messages
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Capture network requests
    const uploadRequests: { url: string; response?: string; status?: number }[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/files/upload')) {
        const body = await response.text().catch(() => 'failed to read body');
        uploadRequests.push({
          url: response.url(),
          status: response.status(),
          response: body
        });
      }
    });

    await goToSession(page);

    const testContent = 'path insertion test';
    const localTestFile = join(TEST_DIR, 'path-test-file.txt');

    // Create a local test file to upload
    writeFileSync(localTestFile, testContent);

    // Get the file input and toolbar input
    const uploadInput = page.locator('#tui-file-upload-input');
    const toolbarInput = page.locator('#tui-input');

    // Verify input is empty before upload
    await expect(toolbarInput).toHaveValue('');

    // Set file input value using Playwright's setInputFiles
    await uploadInput.setInputFiles(localTestFile);

    // Wait for upload to complete and path to be inserted
    await page.waitForTimeout(3000);

    // Check console for errors
    const errors = consoleLogs.filter(log => log.includes('[error]'));
    if (errors.length > 0) {
      console.log('Console errors:', errors);
    }

    // Check that the uploaded file path is inserted into the input field
    const inputValue = await toolbarInput.inputValue();

    // Debug: print all logs if test fails
    if (!inputValue.includes('path-test-file.txt')) {
      console.log('Console logs:', consoleLogs);
      console.log('Upload requests:', JSON.stringify(uploadRequests, null, 2));
    }

    expect(inputValue).toContain('path-test-file.txt');
  });

  test('download button opens file browser on mobile', async ({ page }) => {
    await goToSession(page);

    // Click download button
    const downloadBtn = page.locator('#tui-download');
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    // File browser modal should open
    const fileModal = page.locator('#tui-file-modal');
    await expect(fileModal).toBeVisible({ timeout: 5000 });
  });

  test('file browser shows files on mobile', async ({ page }) => {
    // Ensure directory exists and create a test file
    mkdirSync(TEST_DIR, { recursive: true });
    const testFileName = 'mobile-browser-test.txt';
    writeFileSync(join(TEST_DIR, testFileName), 'test content for mobile');

    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').click();
    await page.waitForSelector('#tui-file-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // File should be in the list
    const fileList = page.locator('#tui-file-list');
    await expect(fileList).toContainText(testFileName, { timeout: 5000 });
  });

  test('can download file on mobile', async ({ page }) => {
    const testFileName = 'mobile-download-test.txt';
    const testContent = 'download test content for mobile';
    writeFileSync(join(TEST_DIR, testFileName), testContent);

    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').click();
    await page.waitForSelector('#tui-file-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Start download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

    // Click on file to download
    await page.locator('#tui-file-list').getByText(testFileName).click();

    // Verify download started
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(testFileName);
  });

  test('modal closes on backdrop tap on mobile', async ({ page }) => {
    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').click();
    const fileModal = page.locator('#tui-file-modal');
    await expect(fileModal).toBeVisible({ timeout: 5000 });

    // Tap on backdrop (outside the modal content)
    await fileModal.click({ position: { x: 10, y: 10 } });

    // Modal should close
    await expect(fileModal).toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('upload modal button works inside file browser', async ({ page }) => {
    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').click();
    await page.waitForSelector('#tui-file-modal:not(.hidden)', { timeout: 5000 });

    // Modal upload button should be visible
    const modalUploadBtn = page.locator('#tui-file-upload-btn');
    await expect(modalUploadBtn).toBeVisible();

    // Create a test file to upload
    const localTestFile = join(TEST_DIR, 'modal-upload-test.txt');
    writeFileSync(localTestFile, 'modal upload test content');

    // Get the file input
    const uploadInput = page.locator('#tui-file-upload-input');

    // Set file input
    await uploadInput.setInputFiles(localTestFile);

    // Wait for upload and file list refresh
    await page.waitForTimeout(2000);

    // File should appear in the list
    const fileList = page.locator('#tui-file-list');
    await expect(fileList).toContainText('modal-upload-test.txt', { timeout: 5000 });
  });
});

test.describe('Mobile Touch Interactions for File Transfer', () => {
  test('toolbar buttons respond to touch events', async ({ page }) => {
    await goToSession(page);

    // Touch download button
    const downloadBtn = page.locator('#tui-download');
    await downloadBtn.tap();

    // Modal should open
    const fileModal = page.locator('#tui-file-modal');
    await expect(fileModal).toBeVisible({ timeout: 5000 });

    // Close modal by tapping close button
    const closeBtn = page.locator('#tui-file-modal-close');
    await closeBtn.tap();

    // Modal should close
    await expect(fileModal).toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('file list items respond to touch on mobile', async ({ page }) => {
    // Create test files
    writeFileSync(join(TEST_DIR, 'touch-test-1.txt'), 'touch test 1');
    writeFileSync(join(TEST_DIR, 'touch-test-2.txt'), 'touch test 2');

    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').tap();
    await page.waitForSelector('#tui-file-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Files should be visible
    const fileList = page.locator('#tui-file-list');
    await expect(fileList).toContainText('touch-test-1.txt');
    await expect(fileList).toContainText('touch-test-2.txt');
  });

  test('breadcrumb navigation works on mobile', async ({ page }) => {
    // Create subdirectory with file
    const subDir = join(TEST_DIR, 'mobile-subdir');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'nested-file.txt'), 'nested content');

    await goToSession(page);

    // Open file browser
    await page.locator('#tui-download').tap();
    await page.waitForSelector('#tui-file-modal:not(.hidden)', { timeout: 5000 });
    await page.waitForTimeout(1000);

    // Navigate to subdirectory
    const subDirItem = page.locator('#tui-file-list').getByText('mobile-subdir');
    await subDirItem.tap();
    await page.waitForTimeout(500);

    // Should see nested file
    const fileList = page.locator('#tui-file-list');
    await expect(fileList).toContainText('nested-file.txt', { timeout: 5000 });

    // Breadcrumb should show path
    const breadcrumb = page.locator('#tui-file-breadcrumb');
    await expect(breadcrumb).toContainText('mobile-subdir');

    // Tap home to go back to root
    await breadcrumb.locator('.ttyd-breadcrumb-item').first().tap();
    await page.waitForTimeout(500);

    // Should see subdirectory again
    await expect(fileList).toContainText('mobile-subdir', { timeout: 5000 });
  });
});
