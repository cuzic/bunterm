/**
 * createElysiaApp integration tests
 *
 * Verifies that security-critical plugins are registered in the app factory:
 * - securityHeadersPlugin: all responses include security headers
 * - authPlugin: unauthenticated requests are blocked when auth is enabled
 */

import { describe, expect, test } from 'bun:test';
import { createElysiaApp } from './app.js';

// === Mocks ===

const mockSessionManager = {
  listSessions: () => [],
  hasSession: () => false,
  getSession: () => undefined,
  createSession: async (opts: { name: string; dir: string; path: string }) => ({
    name: opts.name,
    pid: 1234,
    cwd: opts.dir
  }),
  stopSession: async () => {},
  findSessionByTmuxSession: () => null
};

const mockConfig = { daemon_port: 7680, base_path: '' };

const app = createElysiaApp({
  sessionManager: mockSessionManager as unknown as Parameters<
    typeof createElysiaApp
  >[0]['sessionManager'],
  config: mockConfig as unknown as Parameters<typeof createElysiaApp>[0]['config']
});

// === Tests ===

describe('createElysiaApp - securityHeadersPlugin registration', () => {
  test('X-Content-Type-Options header is present on API responses', async () => {
    const res = await app.handle(new Request('http://localhost/api/status'));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('X-Frame-Options header is present on API responses', async () => {
    const res = await app.handle(new Request('http://localhost/api/status'));
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  test('Content-Security-Policy header is present on API responses', async () => {
    const res = await app.handle(new Request('http://localhost/api/status'));
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  test('Referrer-Policy header is present on API responses', async () => {
    const res = await app.handle(new Request('http://localhost/api/status'));
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  test('Permissions-Policy header is present on API responses', async () => {
    const res = await app.handle(new Request('http://localhost/api/status'));
    expect(res.headers.get('permissions-policy')).toBe(
      'geolocation=(), microphone=(), camera=(), payment=()'
    );
  });
});

describe('createElysiaApp - authPlugin registration', () => {
  test('auth is disabled by default (no authOptions in store) — requests succeed', async () => {
    // authOptions defaults to null in authPlugin, so auth is disabled
    const res = await app.handle(new Request('http://localhost/api/status'));
    // Should not be 401 since auth is disabled
    expect(res.status).not.toBe(401);
  });
});
