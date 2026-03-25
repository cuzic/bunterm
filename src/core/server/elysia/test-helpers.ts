/**
 * Shared test helpers for Elysia route tests.
 * Eliminates duplicate mock definitions across test files.
 */

import { treaty } from '@elysiajs/eden';
import { createElysiaApp } from './app.js';

type MockSessionManager = Record<string, unknown>;

export function createMockSessionManager(overrides?: Partial<MockSessionManager>) {
  return {
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
    stopSession: async (_name: string) => {},
    findSessionByTmuxSession: () => null,
    ...overrides
  };
}

export const DEFAULT_MOCK_CONFIG = { daemon_port: 7680, base_path: '' };

export function createTestElysiaApp(options?: {
  sessionManager?: MockSessionManager;
  config?: Record<string, unknown>;
}) {
  const sm = options?.sessionManager ?? createMockSessionManager();
  const cfg = options?.config ?? DEFAULT_MOCK_CONFIG;
  const app = createElysiaApp({
    sessionManager: sm as unknown as Parameters<typeof createElysiaApp>[0]['sessionManager'],
    config: cfg as unknown as Parameters<typeof createElysiaApp>[0]['config']
  });
  return { app, client: treaty(app), sessionManager: sm, config: cfg };
}
