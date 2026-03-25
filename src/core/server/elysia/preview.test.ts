/**
 * Preview Plugin XSS Prevention Tests
 *
 * Verifies that the markdown preview endpoint does not allow XSS via inline HTML.
 * Specifically checks that markdown-it is initialized with html: false so that
 * <script> tags in markdown content are not rendered as HTML.
 */

import { describe, expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { previewFilePlugin } from './preview.js';
import { createMockSessionManager, DEFAULT_MOCK_CONFIG } from './test-helpers.js';

// === Helpers ===

function createPreviewApp(testDir: string) {
  const mockSessionManager = createMockSessionManager({
    getSession: (name: string) =>
      name === 'test-session' ? { name: 'test-session', pid: 1234, cwd: testDir } : undefined,
    listSessions: () => [],
    hasSession: () => false
  });

  return new Elysia()
    .state('sessionManager', mockSessionManager)
    .state('config', DEFAULT_MOCK_CONFIG)
    .use(previewFilePlugin);
}

async function previewMarkdownFile(content: string): Promise<string> {
  const testDir = tmpdir();
  const testFile = join(testDir, `preview-xss-test-${Date.now()}.md`);
  writeFileSync(testFile, content);
  const filename = testFile.split('/').pop()!;

  try {
    const app = createPreviewApp(testDir);
    const res = await app.handle(
      new Request(`http://localhost/api/preview?session=test-session&path=${filename}`)
    );
    expect(res.status).toBe(200);
    return await res.text();
  } finally {
    try {
      unlinkSync(testFile);
    } catch {}
  }
}

// === Tests ===

describe('previewFilePlugin - XSS prevention', () => {
  test('generated HTML template uses html: false in markdown-it config', async () => {
    const html = await previewMarkdownFile('# Hello World');
    expect(html).toContain('html: false');
  });

  test('markdown with <script> tag: template embeds content as JSON (not raw HTML)', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    const html = await previewMarkdownFile(`# Test\n\n${xssPayload}`);

    // The markdown-it config must have html: false to prevent rendering inline HTML
    expect(html).toContain('html: false');

    // The content must be embedded as a JSON string, not raw interpolation
    // JSON.stringify wraps content in quotes and escapes internal quotes
    expect(html).toContain('const content = ');
  });

  test('markdown with </script> breakout attempt: content is JSON-encoded', async () => {
    // This verifies the content is embedded as JSON.stringify output (a JS string literal)
    const malicious = 'text</script><script>alert(1)</script>';
    const html = await previewMarkdownFile(malicious);

    // The html: false flag prevents markdown-it from rendering inline HTML as HTML nodes
    expect(html).toContain('html: false');

    // Content appears as a JSON-encoded string assignment
    expect(html).toContain('const content = ');
  });

  test('markdown-it config does NOT use html: true', async () => {
    const html = await previewMarkdownFile('# Safe content');
    expect(html).not.toContain('html: true');
  });
});
