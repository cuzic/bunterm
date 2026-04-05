/**
 * Tests for POST /api/osc633 endpoint
 *
 * Tests the OSC 633 side-channel API that receives sequences from
 * the osc633-sender binary and forwards them to the target session.
 */

import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { osc633Plugin } from './osc633.js';
import { createMockSessionManager, DEFAULT_MOCK_CONFIG } from './test-helpers.js';

// === Helpers ===

type InjectOSC633Args = { type: string; data?: string };

function createOsc633App(options?: {
  injectOSC633?: (args: InjectOSC633Args) => void;
  sessionExists?: boolean;
}) {
  const sessionExists = options?.sessionExists ?? true;
  const injectOSC633 = options?.injectOSC633 ?? (() => {});

  const mockSessionManager = createMockSessionManager({
    getSession: (name: string) => {
      if (name === 'test-session' && sessionExists) {
        return {
          name: 'test-session',
          pid: 1234,
          cwd: '/tmp/test',
          injectOSC633
        };
      }
      return undefined;
    }
  });

  return new Elysia()
    .state('sessionManager', mockSessionManager)
    .state('config', DEFAULT_MOCK_CONFIG)
    .use(osc633Plugin);
}

async function postOsc633(
  app: Elysia,
  body: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const res = await app.handle(
    new Request('http://localhost/api/osc633', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  const data = await res.json();
  return { status: res.status, data };
}

// === Tests ===

describe('POST /api/osc633', () => {
  describe('happy path', () => {
    test('returns success: true when session exists', async () => {
      const app = createOsc633App();
      const { status, data } = await postOsc633(app, {
        session: 'test-session',
        type: 'C'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(true);
    });

    test('forwards type A (prompt start) to the session', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'A' });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('A');
      expect(calls[0].data).toBeUndefined();
    });

    test('forwards type B (prompt end) to the session', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'B' });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('B');
    });

    test('forwards type C (pre-execution) to the session', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'C' });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('C');
    });

    test('forwards type D (command finished) with exit code data', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'D', data: '0' });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('D');
      expect(calls[0].data).toBe('0');
    });

    test('forwards type E (explicit command line) with command data', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'E', data: 'ls -la' });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('E');
      expect(calls[0].data).toBe('ls -la');
    });

    test('forwards type P (property) with Cwd data', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, {
        session: 'test-session',
        type: 'P',
        data: 'Cwd=/home/user'
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].type).toBe('P');
      expect(calls[0].data).toBe('Cwd=/home/user');
    });

    test('passes data field as undefined when not provided', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({ injectOSC633: (args) => calls.push(args) });

      await postOsc633(app, { session: 'test-session', type: 'A' });

      expect(calls[0].data).toBeUndefined();
    });

    test('response does not contain error field on success', async () => {
      const app = createOsc633App();
      const { data } = await postOsc633(app, { session: 'test-session', type: 'C' });

      expect((data as { error?: string }).error).toBeUndefined();
    });
  });

  describe('session not found', () => {
    test('returns success: false when session does not exist', async () => {
      const app = createOsc633App({ sessionExists: false });
      const { status, data } = await postOsc633(app, {
        session: 'nonexistent-session',
        type: 'C'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(false);
    });

    test('returns error: "session not found" when session does not exist', async () => {
      const app = createOsc633App({ sessionExists: false });
      const { data } = await postOsc633(app, {
        session: 'nonexistent-session',
        type: 'C'
      });

      expect((data as { error: string }).error).toBe('session not found');
    });

    test('does not call injectOSC633 when session is missing', async () => {
      const calls: InjectOSC633Args[] = [];
      const app = createOsc633App({
        sessionExists: false,
        injectOSC633: (args) => calls.push(args)
      });

      await postOsc633(app, { session: 'ghost', type: 'C' });

      expect(calls).toHaveLength(0);
    });
  });

  describe('request body validation', () => {
    test('rejects request with invalid type value (not A-P)', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, {
        session: 'test-session',
        type: 'Z'
      });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with lowercase type value', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, {
        session: 'test-session',
        type: 'c'
      });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with multi-character type value', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, {
        session: 'test-session',
        type: 'CC'
      });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with missing session field', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, { type: 'C' });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with missing type field', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, { session: 'test-session' });

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('rejects request with empty body', async () => {
      const app = createOsc633App();
      const { status } = await postOsc633(app, {});

      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('accepts optional data field as a string', async () => {
      const app = createOsc633App();
      const { status, data } = await postOsc633(app, {
        session: 'test-session',
        type: 'D',
        data: '127'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(true);
    });

    test('accepts request without optional data field', async () => {
      const app = createOsc633App();
      const { status, data } = await postOsc633(app, {
        session: 'test-session',
        type: 'A'
      });

      expect(status).toBe(200);
      expect((data as { success: boolean }).success).toBe(true);
    });
  });

  describe('all valid OSC 633 types are accepted', () => {
    const validTypes = ['A', 'B', 'C', 'D', 'E', 'P'];

    for (const type of validTypes) {
      test(`accepts type "${type}"`, async () => {
        const app = createOsc633App();
        const { status, data } = await postOsc633(app, {
          session: 'test-session',
          type
        });

        expect(status).toBe(200);
        expect((data as { success: boolean }).success).toBe(true);
      });
    }
  });
});
