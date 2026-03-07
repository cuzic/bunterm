// Import test setup FIRST to set environment variables before any other imports
import { cleanupTestState, resetTestState } from '@/test-setup.js';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { setDaemonState } from '@/config/state.js';
import type { Config } from '@/config/types.js';
import type { Server } from 'bun';
import {
  apiRequest,
  getSessions,
  getStatus,
  requestShutdown,
  startSession,
  stopSession
} from './index.js';

describe('client HTTP API feature tests', () => {
  let mockServer: Server;
  let mockPort: number;

  // Mock responses
  const mockStatus = {
    daemon: { pid: 1234, port: 7680, started_at: '2024-01-01T00:00:00Z' },
    sessions: [
      {
        name: 'test-session',
        pid: 5678,
        port: 7601,
        path: '/test',
        dir: '/home/user/test',
        started_at: '2024-01-01T00:00:00Z',
        fullPath: '/bunterm/test'
      }
    ]
  };

  const mockSessions = mockStatus.sessions;

  const mockNewSession = {
    name: 'new-session',
    pid: 9999,
    port: 7602,
    path: '/new',
    dir: '/home/user/new',
    started_at: '2024-01-01T00:00:00Z',
    fullPath: '/bunterm/new'
  };

  // Route handlers for mock server
  type RouteHandler = (req: Request, path: string) => Response | null;

  const createRouteHandlers = (
    status: typeof mockStatus,
    sessions: typeof mockSessions,
    newSession: typeof mockNewSession
  ): RouteHandler[] => [
    // GET /bunterm/api/status
    (req, path) =>
      path === '/bunterm/api/status' && req.method === 'GET' ? Response.json(status) : null,

    // GET /bunterm/api/sessions
    (req, path) =>
      path === '/bunterm/api/sessions' && req.method === 'GET' ? Response.json(sessions) : null,

    // POST /bunterm/api/sessions
    (req, path) =>
      path === '/bunterm/api/sessions' && req.method === 'POST'
        ? Response.json(newSession, { status: 201 })
        : null,

    // DELETE /bunterm/api/sessions/:name
    (req, path) => {
      if (!path.startsWith('/bunterm/api/sessions/') || req.method !== 'DELETE') {
        return null;
      }
      const name = decodeURIComponent(path.split('/').pop() ?? '');
      return name === 'nonexistent'
        ? Response.json({ error: 'Session not found' }, { status: 400 })
        : Response.json({ success: true });
    },

    // POST /bunterm/api/shutdown
    (req, path) =>
      path === '/bunterm/api/shutdown' && req.method === 'POST'
        ? Response.json({ success: true })
        : null
  ];

  beforeAll(() => {
    resetTestState();

    const handlers = createRouteHandlers(mockStatus, mockSessions, mockNewSession);

    // Create mock HTTP server
    mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;

        for (const handler of handlers) {
          const response = handler(req, path);
          if (response) {
            return response;
          }
        }

        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    });

    mockPort = mockServer.port;

    // Set daemon state to point to our mock server
    setDaemonState({ pid: 1234, port: mockPort, started_at: new Date().toISOString() });
  });

  afterAll(() => {
    mockServer.stop();
    cleanupTestState();
  });

  const testConfig: Config = {
    base_path: '/bunterm',
    daemon_port: 7680, // Will be overridden by getDaemonState
    listen_addresses: ['127.0.0.1'],
    auto_attach: true,
    sessions: [],
    caddy_admin_api: 'http://localhost:2019',
    tmux_mode: 'auto'
  };

  describe('getStatus', () => {
    test('returns status response', async () => {
      const status = await getStatus(testConfig);

      expect(status).toHaveProperty('daemon');
      expect(status).toHaveProperty('sessions');
      expect(status.daemon?.pid).toBe(1234);
      expect(status.sessions).toHaveLength(1);
      expect(status.sessions[0].name).toBe('test-session');
    });
  });

  describe('getSessions', () => {
    test('returns sessions array', async () => {
      const sessions = await getSessions(testConfig);

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('test-session');
      expect(sessions[0].port).toBe(7601);
    });
  });

  describe('startSession', () => {
    test('creates new session', async () => {
      const request = { name: 'new-session', dir: '/home/user/new' };
      const session = await startSession(testConfig, request);

      expect(session.name).toBe('new-session');
      expect(session.port).toBe(7602);
      expect(session.fullPath).toBe('/bunterm/new');
    });
  });

  describe('stopSession', () => {
    test('stops existing session', async () => {
      // Should not throw
      await stopSession(testConfig, 'test-session');
    });

    test('throws error for nonexistent session', async () => {
      await expect(stopSession(testConfig, 'nonexistent')).rejects.toThrow('Session not found');
    });
  });

  describe('requestShutdown', () => {
    test('sends shutdown request', async () => {
      // Should not throw
      await requestShutdown(testConfig);
    });
  });

  describe('apiRequest', () => {
    test('handles GET request', async () => {
      const data = await apiRequest(testConfig, 'GET', '/api/status');
      expect(data).toHaveProperty('daemon');
    });

    test('handles POST request with body', async () => {
      const data = await apiRequest(testConfig, 'POST', '/api/sessions', {
        name: 'test',
        dir: '/test'
      });
      expect(data).toHaveProperty('name');
    });

    test('throws error for 404 response', async () => {
      await expect(apiRequest(testConfig, 'GET', '/api/unknown')).rejects.toThrow('Not found');
    });
  });
});
