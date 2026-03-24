/**
 * Auth Plugin Tests
 *
 * Verifies the Elysia authPlugin behavior:
 * - Auth disabled → all requests succeed
 * - Localhost bypass → local requests skip auth
 * - Unauthenticated request → 401 (or 404 in stealth mode)
 * - Valid cookie session → authenticated (200)
 */

import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type { AuthMiddlewareOptions } from '@/core/server/auth/auth-middleware.js';
import type { CookieSessionStore } from '@/core/server/auth/cookie-session.js';
import { authPlugin } from './auth.js';

// === Mocks ===

const VALID_SESSION_ID = 'valid-session-abc123';
const VALID_TOKEN = 'valid-otp-token';

function makeCookieStore(validId = VALID_SESSION_ID): CookieSessionStore {
  return {
    create: (ttlSeconds: number, remoteAddr?: string) => ({
      id: `new-session-${Date.now()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
      remoteAddr: remoteAddr ?? 'unknown'
    }),
    validate: (id: string) => id === validId,
    revoke: () => {},
    cleanup: () => 0,
    listSessions: () => []
  };
}

function makeTokenGenerator(validToken = VALID_TOKEN) {
  return {
    generate: async (_sessionId: string) => validToken,
    validate: async (token: string) =>
      token === validToken
        ? ({ valid: true } as { valid: true })
        : ({ valid: false, reason: 'invalid' } as { valid: false; reason: string })
  };
}

function makeAuthOptions(overrides: Partial<AuthMiddlewareOptions> = {}): AuthMiddlewareOptions {
  return {
    enabled: true,
    localhostBypass: false,
    cookieSessionStore: makeCookieStore(),
    tokenGenerator: makeTokenGenerator() as unknown as AuthMiddlewareOptions['tokenGenerator'],
    basePath: '/',
    cookieName: 'bunterm-session',
    sessionTtlSeconds: 3600,
    secureCookie: false,
    stealthMode: false,
    adaptiveShield: false,
    lanSessionTtlSeconds: 43200,
    internetSessionTtlSeconds: 3600,
    ...overrides
  };
}

// === App builder ===

function createApp(authOptions: AuthMiddlewareOptions | null = null) {
  return new Elysia()
    .use(authPlugin)
    .state('authOptions', authOptions)
    .get('/test', () => ({ ok: true }));
}

// === Tests ===

describe('authPlugin', () => {
  describe('auth disabled', () => {
    test('allows all requests when authOptions is null', async () => {
      const app = createApp(null);
      const res = await app.handle(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
    });

    test('allows all requests when enabled is false', async () => {
      const app = createApp(makeAuthOptions({ enabled: false }));
      const res = await app.handle(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
    });
  });

  describe('localhost bypass', () => {
    test('allows request from 127.0.0.1 when localhostBypass is true', async () => {
      const app = createApp(makeAuthOptions({ localhostBypass: true }));
      const res = await app.handle(new Request('http://127.0.0.1/test'));
      expect(res.status).toBe(200);
    });

    test('allows request from ::1 when localhostBypass is true', async () => {
      const app = createApp(makeAuthOptions({ localhostBypass: true }));
      const res = await app.handle(new Request('http://[::1]/test'));
      expect(res.status).toBe(200);
    });

    test('allows request from localhost hostname when localhostBypass is true', async () => {
      const app = createApp(makeAuthOptions({ localhostBypass: true }));
      const res = await app.handle(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
    });

    test('blocks remote IP even when localhostBypass is true', async () => {
      const app = createApp(makeAuthOptions({ localhostBypass: true }));
      const res = await app.handle(new Request('http://192.168.1.10/test'));
      expect(res.status).toBe(401);
    });

    test('blocks request when localhostBypass is false even from localhost', async () => {
      const app = createApp(makeAuthOptions({ localhostBypass: false }));
      const res = await app.handle(new Request('http://127.0.0.1/test'));
      expect(res.status).toBe(401);
    });
  });

  describe('unauthenticated request handling', () => {
    test('returns 401 for unauthenticated request (no cookie)', async () => {
      const app = createApp(makeAuthOptions({ stealthMode: false }));
      const res = await app.handle(new Request('http://192.168.1.1/test'));
      expect(res.status).toBe(401);
    });

    test('returns 404 in stealth mode for unauthenticated request', async () => {
      const app = createApp(makeAuthOptions({ stealthMode: true }));
      const res = await app.handle(new Request('http://192.168.1.1/test'));
      expect(res.status).toBe(404);
    });
  });

  describe('valid cookie session', () => {
    test('allows request with valid session cookie', async () => {
      const app = createApp(makeAuthOptions());
      const res = await app.handle(
        new Request('http://192.168.1.1/test', {
          headers: { Cookie: `bunterm-session=${VALID_SESSION_ID}` }
        })
      );
      expect(res.status).toBe(200);
    });

    test('blocks request with invalid session cookie', async () => {
      const app = createApp(makeAuthOptions());
      const res = await app.handle(
        new Request('http://192.168.1.1/test', {
          headers: { Cookie: 'bunterm-session=bad-session-id' }
        })
      );
      expect(res.status).toBe(401);
    });

    test('blocks request with expired/unknown session cookie in stealth mode', async () => {
      const app = createApp(makeAuthOptions({ stealthMode: true }));
      const res = await app.handle(
        new Request('http://192.168.1.1/test', {
          headers: { Cookie: 'bunterm-session=expired-id' }
        })
      );
      expect(res.status).toBe(404);
    });
  });

  describe('derived auth context', () => {
    test('authenticated is true when request is from localhost with bypass', async () => {
      let capturedAuth: boolean | undefined;

      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions({ localhostBypass: true }))
        .get('/test', ({ authenticated }) => {
          capturedAuth = authenticated;
          return { ok: true };
        });

      await app.handle(new Request('http://127.0.0.1/test'));
      expect(capturedAuth).toBe(true);
    });

    test('unauthenticated remote request is blocked with 401', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions({ localhostBypass: false }))
        .get('/test', ({ authenticated }) => {
          return { ok: true, authenticated };
        });

      const response = await app.handle(new Request('http://10.0.0.1/test'));
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('UNAUTHORIZED');
    });

    test('route handler is not called for unauthenticated request', async () => {
      let handlerCalled = false;

      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions({ localhostBypass: false }))
        .get('/test', () => {
          handlerCalled = true;
          return { ok: true };
        });

      const res = await app.handle(new Request('http://10.0.0.1/test'));
      expect(res.status).toBe(401);
      expect(handlerCalled).toBe(false);
    });
  });

  describe('OTP path exemption', () => {
    test('allows unauthenticated request to /api/auth/otp', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions())
        .get('/api/auth/otp', () => ({ ok: true }));

      const res = await app.handle(new Request('http://192.168.1.1/api/auth/otp'));
      expect(res.status).toBe(200);
    });

    test('allows unauthenticated request to paths containing /auth/otp (with base path)', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions())
        .get('/bunterm/api/auth/otp', () => ({ ok: true }));

      const res = await app.handle(new Request('http://192.168.1.1/bunterm/api/auth/otp'));
      expect(res.status).toBe(200);
    });

    test('allows unauthenticated request to /auth/ws-token', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions())
        .get('/auth/ws-token', () => ({ ok: true }));

      const res = await app.handle(new Request('http://192.168.1.1/auth/ws-token'));
      expect(res.status).toBe(200);
    });

    test('stealth mode still exempts /api/auth/otp path', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions({ stealthMode: true }))
        .get('/api/auth/otp', () => ({ ok: true }));

      const res = await app.handle(new Request('http://192.168.1.1/api/auth/otp'));
      expect(res.status).toBe(200);
    });

    test('blocks unauthenticated request to unrelated /api paths', async () => {
      const app = new Elysia()
        .use(authPlugin)
        .state('authOptions', makeAuthOptions())
        .get('/api/sessions', () => ({ sessions: [] }));

      const res = await app.handle(new Request('http://192.168.1.1/api/sessions'));
      expect(res.status).toBe(401);
    });
  });
});
