/**
 * base_path Variation Tests
 *
 * Verifies that API routes (/api/status, /api/sessions, etc.) work correctly
 * regardless of the base_path config value. base_path affects the portal/redirect
 * UI layer, not the API routes themselves.
 */

import { describe, expect, test } from 'bun:test';
import { createMockSessionManager, createTestElysiaApp } from './test-helpers.js';

// === Shared Mock ===

const mockSessionManager = createMockSessionManager({
  listSessions: () => [
    {
      name: 'test-session',
      pid: 1234,
      dir: '/tmp/test',
      startedAt: '2024-01-01T00:00:00Z',
      clientCount: 0,
      tmuxSession: undefined
    }
  ]
});

// === Helper ===

function createTestClient(basePath: string) {
  const { client } = createTestElysiaApp({
    sessionManager: mockSessionManager,
    config: { daemon_port: 7680, base_path: basePath }
  });
  return client;
}

// === Tests ===

describe('base_path variations — API routes are path-independent', () => {
  const basePaths = ['/', '/bunterm', '/a/b'];

  for (const basePath of basePaths) {
    describe(`base_path: '${basePath}'`, () => {
      const client = createTestClient(basePath);

      describe('GET /api/status', () => {
        test('returns daemon info', async () => {
          const { data, error } = await client.api.status.get();

          expect(error).toBeNull();
          expect(data?.daemon.pid).toBe(process.pid);
          expect(data?.daemon.port).toBe(7680);
          expect(data?.daemon.backend).toBe('native');
        });

        test('returns sessions array', async () => {
          const { data, error } = await client.api.status.get();

          expect(error).toBeNull();
          expect(data?.sessions).toHaveLength(1);
          expect(data?.sessions[0].name).toBe('test-session');
        });
      });

      describe('GET /api/sessions', () => {
        test('returns session list', async () => {
          const { data, error } = await client.api.sessions.get();

          expect(error).toBeNull();
          expect(data).toHaveLength(1);
          expect(data![0].name).toBe('test-session');
          expect(data![0].pid).toBe(1234);
        });
      });

      describe('POST /api/sessions', () => {
        test('creates session successfully', async () => {
          const { data, error, status } = await client.api.sessions.post({
            name: 'new-session',
            dir: '/tmp/new'
          });

          expect(error).toBeNull();
          expect(status).toBe(201);
          expect(data?.name).toBe('new-session');
          expect(data?.existing).toBe(false);
        });

        test('returns 409 for duplicate session', async () => {
          const { status } = await client.api.sessions.post({ name: 'test-session' });
          expect(status).toBe(409);
        });
      });

      describe('DELETE /api/sessions/:name', () => {
        test('deletes existing session', async () => {
          const { data, error } = await client.api.sessions({ name: 'test-session' }).delete();

          expect(error).toBeNull();
          expect(data?.success).toBe(true);
        });

        test('returns 404 for nonexistent session', async () => {
          const { status } = await client.api.sessions({ name: 'ghost' }).delete();

          expect(status).toBe(404);
        });
      });
    });
  }
});
