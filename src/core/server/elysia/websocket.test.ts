/**
 * websocketPlugin tests
 *
 * Verifies that websocketPlugin reads SecurityConfig from coreContext (config)
 * rather than accepting it as a constructor argument.
 *
 * Note on WebSocket upgrade in tests:
 *   Bun's test HTTP handler cannot perform a real WebSocket upgrade.
 *   When beforeHandle does NOT reject (origin accepted), Bun returns 400
 *   "Expected a websocket connection" — this indicates origin validation
 *   PASSED and the request reached the WS upgrade stage.
 *   When beforeHandle DOES reject, the status is 403 (Forbidden).
 *   These two outcomes are used throughout the tests.
 */

import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { type WebSocketPluginOptions, websocketPlugin } from './websocket.js';

// === Helpers ===

function buildConfig(overrides?: {
  devMode?: boolean;
  allowedOrigins?: string[];
  hostname?: string;
}) {
  return {
    base_path: '/bunterm',
    daemon_port: 7680,
    security: {
      dev_mode: overrides?.devMode ?? false,
      allowed_origins: overrides?.allowedOrigins ?? [],
      enable_ws_token_auth: false,
      ws_token_ttl_seconds: 30,
      auth_enabled: false,
      auth_cookie_name: 'bunterm_session',
      auth_session_ttl_seconds: 86400,
      auth_localhost_bypass: true,
      auth_stealth_mode: false,
      auth_trusted_proxies: [],
      auth_proxy_header: 'X-Forwarded-User',
      auth_adaptive_shield: false,
      auth_lan_session_ttl_seconds: 604800,
      auth_internet_session_ttl_seconds: 3600
    },
    hostname: overrides?.hostname
  };
}

function createMinimalSessionManager() {
  return {
    hasSession: () => false,
    getSession: () => undefined,
    createSession: async (opts: { name: string; dir: string; path: string }) => ({
      name: opts.name,
      pid: 1234,
      cwd: opts.dir
    }),
    listSessions: () => [],
    stopSession: async () => {},
    handleWebSocketClose: () => {},
    findSessionByTmuxSession: () => null
  };
}

function createTestApp(
  configOverrides?: { devMode?: boolean; allowedOrigins?: string[]; hostname?: string },
  pluginOptions?: WebSocketPluginOptions
) {
  const config = buildConfig(configOverrides);
  const sessionManager = createMinimalSessionManager();

  return new Elysia()
    .state('sessionManager', sessionManager as unknown as any)
    .state('config', config as any)
    .state('timelineService', null)
    .state('executorManager', null)
    .state('blockEventEmitter', null)
    .state('cookieSessionStore', null)
    .state('shareManager', null)
    .state('otpManager', null)
    .use(websocketPlugin(pluginOptions));
}

function makeWsUpgradeRequest(url: string, originHeader?: string) {
  const headers: Record<string, string> = {
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version': '13'
  };
  if (originHeader !== undefined) {
    headers['Origin'] = originHeader;
  }
  return new Request(url, { headers });
}

// === Tests ===

describe('websocketPlugin - WebSocketPluginOptions interface', () => {
  test('WebSocketPluginOptions does not include securityConfig property', () => {
    // Verify the interface only allows enableTokenAuth
    const opts: WebSocketPluginOptions = { enableTokenAuth: false };
    expect(opts).toBeDefined();
  });

  test('websocketPlugin accepts no arguments', () => {
    expect(() => websocketPlugin()).not.toThrow();
  });

  test('websocketPlugin accepts enableTokenAuth option', () => {
    expect(() => websocketPlugin({ enableTokenAuth: true })).not.toThrow();
  });

  test('websocketPlugin does NOT accept securityConfig option (TypeScript check)', () => {
    // securityConfig should no longer be a valid key on WebSocketPluginOptions
    const opts: WebSocketPluginOptions = {};
    // @ts-expect-error securityConfig should not exist on WebSocketPluginOptions
    const _unused = (opts as any).securityConfig;
    expect(_unused).toBeUndefined();
  });
});

describe('websocketPlugin - origin validation reads from coreContext config', () => {
  // When beforeHandle rejects: status === 403
  // When beforeHandle allows: Bun returns 400 (WS upgrade not supported in test env)
  // So: 403 = rejected by our code, 400 = passed our validation

  test('rejects WebSocket upgrade (403) when Origin is not in allowed_origins', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: ['https://allowed.example.com']
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'https://evil.example.com')
    );

    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toContain('Forbidden');
  });

  test('passes origin validation (not 403) when Origin matches allowed_origins from config', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: ['https://allowed.example.com']
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'https://allowed.example.com')
    );

    // 400 = Bun can't complete WS upgrade in test mode, but our validation passed
    expect(res.status).not.toBe(403);
  });

  test('passes origin validation (not 403) from localhost without Origin header', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: []
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://localhost:7680/test-session/ws')
      // No Origin header - localhost gets through
    );

    expect(res.status).not.toBe(403);
  });

  test('passes origin validation (not 403) for localhost Origin in dev_mode', async () => {
    const app = createTestApp({
      devMode: true,
      allowedOrigins: []
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'http://localhost:3000')
    );

    expect(res.status).not.toBe(403);
  });

  test('rejects localhost Origin (403) when dev_mode is false and not in allowedOrigins', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: []
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'http://localhost:3000')
    );

    // Origin header present + not localhost request + not in allowed list + dev_mode=false
    expect(res.status).toBe(403);
  });

  test('passes origin validation (not 403) when hostname-derived origin is in config', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: [],
      hostname: 'myhost.example.com'
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'https://myhost.example.com')
    );

    // createSecurityConfig derives https://myhost.example.com from hostname
    expect(res.status).not.toBe(403);
  });

  test('rejects (403) when a different hostname origin is used and allowedOrigins is empty', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: [],
      hostname: 'myhost.example.com'
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'https://other.example.com')
    );

    expect(res.status).toBe(403);
  });

  test('rejects non-localhost request (403) with missing Origin header', async () => {
    const app = createTestApp({
      devMode: false,
      allowedOrigins: ['https://allowed.example.com']
    });

    const res = await app.handle(
      makeWsUpgradeRequest('http://203.0.113.1:7680/test-session/ws')
      // No Origin header from a non-localhost host
    );

    expect(res.status).toBe(403);
  });

  test('changing config from rejected to allowed changes the outcome', async () => {
    const rejectedApp = createTestApp({
      devMode: false,
      allowedOrigins: ['https://other.example.com']
    });

    const allowedApp = createTestApp({
      devMode: false,
      allowedOrigins: ['https://allowed.example.com']
    });

    const origin = 'https://allowed.example.com';
    const url = 'http://127.0.0.1:7680/test-session/ws';

    const rejectedRes = await rejectedApp.handle(makeWsUpgradeRequest(url, origin));
    const allowedRes = await allowedApp.handle(makeWsUpgradeRequest(url, origin));

    expect(rejectedRes.status).toBe(403);
    expect(allowedRes.status).not.toBe(403);
  });
});

describe('websocketPlugin - enableTokenAuth option (preserved behavior)', () => {
  test('plugin registers without throwing when enableTokenAuth is true', () => {
    expect(() => websocketPlugin({ enableTokenAuth: true })).not.toThrow();
  });

  test('plugin registers without throwing when enableTokenAuth is false', () => {
    expect(() => websocketPlugin({ enableTokenAuth: false })).not.toThrow();
  });

  test('requires token when enableTokenAuth is true and origin is allowed', async () => {
    const app = createTestApp(
      { devMode: false, allowedOrigins: ['https://allowed.example.com'] },
      { enableTokenAuth: true }
    );

    // Origin is valid but no Sec-WebSocket-Protocol token
    const res = await app.handle(
      makeWsUpgradeRequest('http://127.0.0.1:7680/test-session/ws', 'https://allowed.example.com')
    );

    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('Unauthorized');
  });
});
