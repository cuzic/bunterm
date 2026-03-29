/**
 * Tests for POST /api/clipboard endpoint
 *
 * Tests the clipboard side-channel API that receives text from CLI tools
 * and broadcasts it to connected browser clients via WebSocket.
 */

import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type { ServerMessage } from '@/core/protocol/index.js';
import { clipboardPlugin } from './clipboard.js';
import { createMockSessionManager, DEFAULT_MOCK_CONFIG } from './test-helpers.js';

// === Helpers ===

function createClipboardApp(options?: {
  broadcastMessage?: (msg: ServerMessage) => void;
  sessionExists?: boolean;
}) {
  const sessionExists = options?.sessionExists ?? true;
  const broadcastMessage = options?.broadcastMessage ?? (() => {});

  const mockSessionManager = createMockSessionManager({
    getSession: (name: string) => {
      if (name === 'test-session' && sessionExists) {
        return {
          name: 'test-session',
          pid: 1234,
          cwd: '/tmp/test',
          broadcastMessage
        };
      }
      return undefined;
    }
  });

  return new Elysia()
    .state('sessionManager', mockSessionManager)
    .state('config', DEFAULT_MOCK_CONFIG)
    .use(clipboardPlugin);
}

async function postClipboard(
  app: Elysia,
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const res = await app.handle(
    new Request('http://localhost/api/clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  const data = await res.json();
  return { status: res.status, data };
}

// === Tests ===

describe('POST /api/clipboard', () => {
  describe('happy path', () => {
    test('returns success: true when session exists', async () => {
      const app = createClipboardApp();
      const { status, data } = await postClipboard(app, {
        session: 'test-session',
        text: 'hello clipboard'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(true);
    });

    test('broadcasts clipboard message to the session', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        broadcastMessage: (msg) => messages.push(msg)
      });

      await postClipboard(app, {
        session: 'test-session',
        text: 'copied text'
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('clipboard');
      expect((messages[0] as { text: string }).text).toBe('copied text');
    });

    test('handles multi-line text', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        broadcastMessage: (msg) => messages.push(msg)
      });

      const multilineText = 'line1\nline2\nline3';
      await postClipboard(app, {
        session: 'test-session',
        text: multilineText
      });

      expect(messages).toHaveLength(1);
      expect((messages[0] as { text: string }).text).toBe(multilineText);
    });

    test('handles empty text', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        broadcastMessage: (msg) => messages.push(msg)
      });

      await postClipboard(app, {
        session: 'test-session',
        text: ''
      });

      expect(messages).toHaveLength(1);
      expect((messages[0] as { text: string }).text).toBe('');
    });

    test('decodes base64-encoded text when encoding is "base64"', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        broadcastMessage: (msg) => messages.push(msg)
      });

      const originalText = 'hello\nworld';
      const encoded = Buffer.from(originalText).toString('base64');
      await postClipboard(app, {
        session: 'test-session',
        text: encoded,
        encoding: 'base64'
      });

      expect(messages).toHaveLength(1);
      expect((messages[0] as { text: string }).text).toBe(originalText);
    });

    test('uses plain text when encoding is not specified', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        broadcastMessage: (msg) => messages.push(msg)
      });

      await postClipboard(app, {
        session: 'test-session',
        text: 'plain text'
      });

      expect(messages).toHaveLength(1);
      expect((messages[0] as { text: string }).text).toBe('plain text');
    });

    test('response does not contain error field on success', async () => {
      const app = createClipboardApp();
      const { data } = await postClipboard(app, {
        session: 'test-session',
        text: 'test'
      });

      expect((data as { error?: string }).error).toBeUndefined();
    });
  });

  describe('session not found', () => {
    test('returns success: false when session does not exist', async () => {
      const app = createClipboardApp({ sessionExists: false });
      const { status, data } = await postClipboard(app, {
        session: 'nonexistent-session',
        text: 'test'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(false);
    });

    test('returns error: "session not found" when session does not exist', async () => {
      const app = createClipboardApp({ sessionExists: false });
      const { data } = await postClipboard(app, {
        session: 'nonexistent-session',
        text: 'test'
      });

      expect((data as { error: string }).error).toBe('session not found');
    });

    test('does not broadcast when session is missing', async () => {
      const messages: ServerMessage[] = [];
      const app = createClipboardApp({
        sessionExists: false,
        broadcastMessage: (msg) => messages.push(msg)
      });

      await postClipboard(app, { session: 'ghost', text: 'test' });

      expect(messages).toHaveLength(0);
    });
  });

  describe('request body validation', () => {
    test('rejects request with missing session field', async () => {
      const app = createClipboardApp();
      const { status } = await postClipboard(app, { text: 'test' });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with missing text field', async () => {
      const app = createClipboardApp();
      const { status } = await postClipboard(app, { session: 'test-session' });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with empty body', async () => {
      const app = createClipboardApp();
      const { status } = await postClipboard(app, {});

      expect(status).toBeGreaterThanOrEqual(400);
    });
  });
});
