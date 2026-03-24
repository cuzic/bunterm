import { describe, expect, test } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { createElysiaApp } from './app.js';

// === Mocks ===

const mockSessionManager = {
  listSessions: () => [
    {
      name: 'test-session',
      pid: 1234,
      dir: '/tmp/test',
      startedAt: '2024-01-01T00:00:00Z',
      clientCount: 2
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
  stopSession: async (_name: string) => {}
};

const mockConfig = { daemon_port: 7680, base_path: '' };

const app = createElysiaApp({
  sessionManager: mockSessionManager as unknown as Parameters<
    typeof createElysiaApp
  >[0]['sessionManager'],
  config: mockConfig as unknown as Parameters<typeof createElysiaApp>[0]['config']
});
const client = treaty(app);

// === Tests ===

describe('sessions API via Eden', () => {
  describe('GET /api/status', () => {
    test('returns daemon info with pid and port', async () => {
      const { data, error } = await client.api.status.get();

      expect(error).toBeNull();
      expect(data?.daemon.pid).toBe(process.pid);
      expect(data?.daemon.port).toBe(7680);
    });

    test('returns sessions array', async () => {
      const { data, error } = await client.api.status.get();

      expect(error).toBeNull();
      expect(data?.sessions).toBeArray();
      expect(data?.sessions).toHaveLength(1);
      expect(data?.sessions[0].name).toBe('test-session');
    });
  });

  describe('GET /api/sessions', () => {
    test('returns sessions array with correct fields', async () => {
      const { data, error } = await client.api.sessions.get();

      expect(error).toBeNull();
      expect(data).toBeArray();
      expect(data).toHaveLength(1);

      const session = data![0];
      expect(session.name).toBe('test-session');
      expect(session.pid).toBe(1234);
      expect(session.dir).toBe('/tmp/test');
      expect(session.started_at).toBeInstanceOf(Date);
    });
  });

  describe('POST /api/sessions', () => {
    test('creates new session and returns name/pid/path/dir', async () => {
      const { data, error } = await client.api.sessions.post({
        name: 'new-session',
        dir: '/tmp/new'
      });

      expect(error).toBeNull();
      expect(data?.name).toBe('new-session');
      expect(data?.pid).toBe(5678);
      expect(data?.dir).toBe('/tmp/new');
      expect(data?.path).toBe('/new-session');
    });

    test('returns 409 for duplicate session name', async () => {
      const { data, error, status } = await client.api.sessions.post({
        name: 'test-session'
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBe(409);
    });

    test('validates body - name is required', async () => {
      const invalidBody = {} as { name: string }; // intentionally invalid for validation test
      const { data, error, status } = await client.api.sessions.post(invalidBody);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('DELETE /api/sessions/:name', () => {
    test('deletes existing session and returns success', async () => {
      const { data, error } = await client.api.sessions({ name: 'test-session' }).delete();

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('returns 404 for nonexistent session', async () => {
      const { data, error, status } = await client.api.sessions({ name: 'nonexistent' }).delete();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBe(404);
    });
  });

  describe('Eden type inference', () => {
    test('status response types are correctly inferred', async () => {
      const { data } = await client.api.status.get();

      // These accesses would cause TypeScript errors if types were not inferred
      expect(typeof data?.daemon.pid).toBe('number');
      expect(typeof data?.daemon.port).toBe('number');
      expect(typeof data?.daemon.backend).toBe('string');
      expect(Array.isArray(data?.sessions)).toBe(true);
    });

    test('sessions response types are correctly inferred', async () => {
      const { data } = await client.api.sessions.get();

      const session = data?.[0];
      expect(typeof session?.name).toBe('string');
      expect(typeof session?.pid).toBe('number');
      expect(typeof session?.dir).toBe('string');
    });
  });
});
