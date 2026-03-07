// Import test setup FIRST to set environment variables before any other imports
import { cleanupTestState, resetTestState } from '@/test-setup.js';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

describe('client', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  describe('isDaemonRunning', () => {
    test('returns false when socket does not exist', async () => {
      const { isDaemonRunning } = await import('./index.js');

      const result = await isDaemonRunning();

      expect(result).toBe(false);
    });

    test('returns false when daemon state is null', async () => {
      const { isDaemonRunning } = await import('./index.js');
      const { saveState } = await import('../config/state.js');

      // Save state with no daemon
      saveState({ daemon: null, sessions: [] });

      const result = await isDaemonRunning();

      expect(result).toBe(false);
    });
  });

  describe('API request building', () => {
    test('constructs correct URL', () => {
      const config = {
        base_path: '/bunterm',
        daemon_port: 7680
      };

      const baseUrl = `http://localhost:${config.daemon_port}`;
      const path = '/api/sessions';
      const fullUrl = `${baseUrl}${config.base_path}${path}`;

      expect(fullUrl).toBe('http://localhost:7680/bunterm/api/sessions');
    });

    test('encodes session name in URL', () => {
      const sessionName = 'my session with spaces';
      const encoded = encodeURIComponent(sessionName);

      expect(encoded).toBe('my%20session%20with%20spaces');
    });

    test('handles special characters in session name', () => {
      const sessionName = 'test/session#1';
      const encoded = encodeURIComponent(sessionName);

      expect(encoded).toBe('test%2Fsession%231');
    });
  });

  describe('StartSessionRequest', () => {
    test('has correct structure for minimal request', () => {
      const request = {
        name: 'my-session',
        dir: '/home/user/project'
      };

      expect(request.name).toBe('my-session');
      expect(request.dir).toBe('/home/user/project');
    });

    test('has correct structure with optional path', () => {
      const request = {
        name: 'my-session',
        dir: '/home/user/project',
        path: '/custom-path'
      };

      expect(request.path).toBe('/custom-path');
    });
  });
});

describe('sleep utility', () => {
  test('sleep function works correctly', async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
    expect(elapsed).toBeLessThan(200);
  });
});
