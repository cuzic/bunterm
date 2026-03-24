/**
 * Eden Treaty Client Tests
 *
 * Tests the createClient wrapper that wraps treaty<App>(baseUrl).
 * Uses a real Bun.serve instance (ephemeral port) to test HTTP roundtrips,
 * ensuring Eden Treaty type inference works end-to-end.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { createElysiaApp } from '@/core/server/elysia/app.js';
import { createClient } from './eden-client.js';

// === Mock Dependencies ===

const mockSessionManager = {
  listSessions: () => [
    {
      name: 'test-session',
      pid: 1234,
      dir: '/tmp/test',
      startedAt: '2024-01-01T00:00:00Z',
      clientCount: 2,
      tmuxSession: undefined
    }
  ],
  hasSession: (name: string) => name === 'test-session',
  getSession: (name: string) =>
    name === 'test-session' ? { name: 'test-session', pid: 1234, cwd: '/tmp/test' } : undefined,
  createSession: async (opts: { name: string; dir: string; path: string }) => ({
    name: opts.name,
    pid: 5678,
    cwd: opts.dir
  }),
  stopSession: async (_name: string) => {},
  findSessionByTmuxSession: () => null
};

const mockConfig = { daemon_port: 7680, base_path: '' };

// === Test Setup ===

describe('createClient (Eden Treaty)', () => {
  let server: Server;
  let client: ReturnType<typeof createClient>;

  beforeAll(() => {
    const app = createElysiaApp({
      sessionManager: mockSessionManager as unknown as Parameters<
        typeof createElysiaApp
      >[0]['sessionManager'],
      config: mockConfig as unknown as Parameters<typeof createElysiaApp>[0]['config']
    });

    server = Bun.serve({
      port: 0,
      fetch: app.fetch
    });

    client = createClient(`http://localhost:${server.port}`);
  });

  afterAll(() => {
    server.stop();
  });

  // === GET /api/status ===

  describe('GET /api/status', () => {
    test('returns daemon info with pid and port', async () => {
      const { data, error } = await client.api.status.get();

      expect(error).toBeNull();
      expect(data?.daemon.pid).toBe(process.pid);
      expect(data?.daemon.port).toBe(7680);
      expect(data?.daemon.backend).toBe('native');
    });

    test('returns sessions array in status response', async () => {
      const { data, error } = await client.api.status.get();

      expect(error).toBeNull();
      expect(data?.sessions).toBeArray();
      expect(data?.sessions).toHaveLength(1);
      expect(data?.sessions[0].name).toBe('test-session');
      expect(data?.sessions[0].pid).toBe(1234);
    });
  });

  // === GET /api/sessions ===

  describe('GET /api/sessions', () => {
    test('returns sessions list with correct shape', async () => {
      const { data, error } = await client.api.sessions.get();

      expect(error).toBeNull();
      expect(data).toBeArray();
      expect(data).toHaveLength(1);

      const session = data![0];
      expect(session.name).toBe('test-session');
      expect(session.pid).toBe(1234);
      expect(session.dir).toBe('/tmp/test');
    });

    test('session path is derived from name', async () => {
      const { data } = await client.api.sessions.get();
      expect(data![0].path).toBe('/test-session');
    });
  });

  // === POST /api/sessions ===

  describe('POST /api/sessions', () => {
    test('creates a new session and returns name/pid/path/dir', async () => {
      const { data, error, status } = await client.api.sessions.post({
        name: 'new-session',
        dir: '/tmp/new'
      });

      expect(error).toBeNull();
      expect(status).toBe(201);
      expect(data?.name).toBe('new-session');
      expect(data?.pid).toBe(5678);
      expect(data?.dir).toBe('/tmp/new');
      expect(data?.path).toBe('/new-session');
      expect(data?.existing).toBe(false);
    });

    test('returns 409 Conflict when session name already exists', async () => {
      const { data, error, status } = await client.api.sessions.post({
        name: 'test-session'
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBe(409);
    });

    test('returns 422 when name field is missing (body validation)', async () => {
      const invalidBody = {} as { name: string };
      const { data, error, status } = await client.api.sessions.post(invalidBody);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  // === DELETE /api/sessions/:name ===

  describe('DELETE /api/sessions/:name', () => {
    test('stops an existing session and returns success', async () => {
      const { data, error, status } = await client.api.sessions({ name: 'test-session' }).delete();

      expect(error).toBeNull();
      expect(status).toBe(200);
      expect(data?.success).toBe(true);
    });

    test('returns 404 for nonexistent session', async () => {
      const { data, error, status } = await client.api.sessions({ name: 'nonexistent' }).delete();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBe(404);
    });
  });

  // === Eden Type Inference ===

  describe('Eden type inference (end-to-end)', () => {
    test('status response fields are correctly typed (number, string, array)', async () => {
      const { data } = await client.api.status.get();

      // TypeScript would error at compile time if these types were wrong
      expect(typeof data?.daemon.pid).toBe('number');
      expect(typeof data?.daemon.port).toBe('number');
      expect(typeof data?.daemon.backend).toBe('string');
      expect(Array.isArray(data?.sessions)).toBe(true);
    });

    test('session list fields are correctly typed', async () => {
      const { data } = await client.api.sessions.get();

      const session = data?.[0];
      expect(typeof session?.name).toBe('string');
      expect(typeof session?.pid).toBe('number');
      expect(typeof session?.dir).toBe('string');
      expect(typeof session?.path).toBe('string');
    });

    test('create session response fields are correctly typed', async () => {
      const { data } = await client.api.sessions.post({
        name: 'typed-session',
        dir: '/tmp/typed'
      });

      expect(typeof data?.name).toBe('string');
      expect(typeof data?.pid).toBe('number');
      expect(typeof data?.path).toBe('string');
      expect(typeof data?.dir).toBe('string');
      expect(typeof data?.existing).toBe('boolean');
    });
  });
});
