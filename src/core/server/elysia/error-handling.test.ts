import { describe, expect, test } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { createElysiaApp } from './app.js';

// === Mocks ===

const mockSessionManager = {
  listSessions: () => [
    {
      name: 'existing-session',
      pid: 1234,
      dir: '/tmp/test',
      startedAt: '2024-01-01T00:00:00Z',
      clientCount: 1
    }
  ],
  hasSession: (name: string) => name === 'existing-session',
  getSession: (name: string) =>
    name === 'existing-session'
      ? { name: 'existing-session', pid: 1234, cwd: '/tmp/test' }
      : undefined,
  createSession: async (opts: { name: string; dir: string; path: string }) => ({
    name: opts.name,
    pid: 5678,
    cwd: opts.dir
  }),
  stopSession: async (_name: string) => {},
  findSessionByTmuxSession: () => null
};

const mockConfig = { daemon_port: 7680, base_path: '' };

const app = createElysiaApp({
  sessionManager: mockSessionManager as unknown as Parameters<
    typeof createElysiaApp
  >[0]['sessionManager'],
  config: mockConfig as unknown as Parameters<typeof createElysiaApp>[0]['config']
});
const client = treaty(app);

// === Error Handling Tests ===

describe('Eden error handling', () => {
  describe('404 - session not found', () => {
    test('DELETE nonexistent session returns 404 with error details', async () => {
      const { data, error, status } = await client.api
        .sessions({ name: 'no-such-session' })
        .delete();

      expect(status).toBe(404);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    test('404 error contains structured error and message fields', async () => {
      const { error } = await client.api.sessions({ name: 'no-such-session' }).delete();

      expect(error).not.toBeNull();
      // Eden wraps non-2xx responses in error.value
      const body = (error as { value: unknown }).value as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe('SESSION_NOT_FOUND');
      expect(body.message).toContain('no-such-session');
    });
  });

  describe('409 - session already exists', () => {
    test('POST duplicate session name returns 409', async () => {
      const { data, error, status } = await client.api.sessions.post({
        name: 'existing-session'
      });

      expect(status).toBe(409);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    test('409 error contains SESSION_ALREADY_EXISTS code', async () => {
      const { error } = await client.api.sessions.post({
        name: 'existing-session'
      });

      const body = (error as { value: unknown }).value as {
        error?: string;
        message?: string;
      };
      expect(body.error).toBe('SESSION_ALREADY_EXISTS');
      expect(body.message).toContain('existing-session');
    });
  });

  describe('422 - validation error', () => {
    test('POST with empty name fails validation', async () => {
      const { data, error, status } = await client.api.sessions.post({
        name: '' // minLength: 1 in schema
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBeGreaterThanOrEqual(400);
    });

    test('POST with missing body fields fails validation', async () => {
      const invalidBody = {} as { name: string };
      const { data, error, status } = await client.api.sessions.post(invalidBody);

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Eden error field shape', () => {
    test('successful response has null error', async () => {
      const { data, error } = await client.api.status.get();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    test('error response has null data', async () => {
      const { data, error } = await client.api.sessions({ name: 'nonexistent' }).delete();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    test('error and data are mutually exclusive in response', async () => {
      // Success case
      const success = await client.api.sessions.get();
      expect(success.data).not.toBeNull();
      expect(success.error).toBeNull();

      // Error case
      const failure = await client.api.sessions({ name: 'nonexistent' }).delete();
      expect(failure.data).toBeNull();
      expect(failure.error).not.toBeNull();
    });
  });

  describe('Eden client unwrap pattern', () => {
    test('unwrap-style error extraction yields useful message for 404', async () => {
      const response = await client.api.sessions({ name: 'ghost' }).delete();

      if (response.error) {
        const body = (response.error as { value: unknown }).value as {
          message?: string;
        };
        expect(body.message).toBeDefined();
        expect(typeof body.message).toBe('string');
        expect(body.message!.length).toBeGreaterThan(0);
      } else {
        throw new Error('Expected error response');
      }
    });

    test('unwrap-style error extraction yields useful message for 409', async () => {
      const response = await client.api.sessions.post({ name: 'existing-session' });

      if (response.error) {
        const body = (response.error as { value: unknown }).value as {
          message?: string;
        };
        expect(body.message).toBeDefined();
        expect(typeof body.message).toBe('string');
        expect(body.message!.length).toBeGreaterThan(0);
      } else {
        throw new Error('Expected error response');
      }
    });
  });
});
