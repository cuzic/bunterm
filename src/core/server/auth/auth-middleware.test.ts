import { describe, expect, it } from 'bun:test';
import { InMemoryNonceStore, TokenGenerator } from '@/core/server/ws/session-token.js';
import {
  type AuthMiddlewareOptions,
  authenticateRequest,
  handleTokenExchange,
  isLocalhost
} from './auth-middleware.js';
import { InMemoryCookieSessionStore } from './cookie-session.js';

function createOptions(overrides: Partial<AuthMiddlewareOptions> = {}): AuthMiddlewareOptions {
  const nonceStore = new InMemoryNonceStore({ cleanupIntervalMs: 999999 });
  return {
    enabled: true,
    localhostBypass: false,
    cookieSessionStore: new InMemoryCookieSessionStore(),
    tokenGenerator: new TokenGenerator({
      secret: 'test-secret-key-must-be-at-least-32-bytes-long!!',
      nonceStore,
      ttlSeconds: 60
    }),
    basePath: '/bunterm',
    cookieName: 'bunterm_session',
    sessionTtlSeconds: 86400,
    secureCookie: false,
    stealthMode: false,
    adaptiveShield: false,
    lanSessionTtlSeconds: 43200,
    internetSessionTtlSeconds: 3600,
    ...overrides
  };
}

function createRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

// === isLocalhost ===

describe('isLocalhost', () => {
  it('returns true for 127.0.0.1 host', () => {
    const req = createRequest('http://127.0.0.1:7680/bunterm');
    expect(isLocalhost(req)).toBe(true);
  });

  it('returns true for localhost host', () => {
    const req = createRequest('http://localhost:7680/bunterm');
    expect(isLocalhost(req)).toBe(true);
  });

  it('returns true for ::1 host', () => {
    const req = createRequest('http://[::1]:7680/bunterm');
    expect(isLocalhost(req)).toBe(true);
  });

  it('returns false for remote host', () => {
    const req = createRequest('http://192.168.1.100:7680/bunterm');
    expect(isLocalhost(req)).toBe(false);
  });

  // X-Forwarded-For is NOT trusted for localhost detection — clients can forge it.
  // These tests document that spoofed headers do NOT bypass the check.
  it('returns false when X-Forwarded-For is 127.0.0.1 but URL host is remote', () => {
    const req = createRequest('http://example.com:7680/bunterm', {
      'X-Forwarded-For': '127.0.0.1'
    });
    expect(isLocalhost(req)).toBe(false);
  });

  it('returns false when X-Forwarded-For is ::1 but URL host is remote', () => {
    const req = createRequest('http://example.com:7680/bunterm', {
      'X-Forwarded-For': '::1'
    });
    expect(isLocalhost(req)).toBe(false);
  });

  it('returns false when X-Forwarded-For is remote and URL host is also remote', () => {
    const req = createRequest('http://example.com:7680/bunterm', {
      'X-Forwarded-For': '203.0.113.50'
    });
    expect(isLocalhost(req)).toBe(false);
  });
});

// === authenticateRequest ===

describe('authenticateRequest', () => {
  it('auth disabled → always authenticated', () => {
    const options = createOptions({ enabled: false });
    const req = createRequest('http://example.com/bunterm');
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(true);
  });

  it('localhost bypass enabled + localhost request → authenticated', () => {
    const options = createOptions({ localhostBypass: true });
    const req = createRequest('http://127.0.0.1:7680/bunterm');
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(true);
  });

  it('localhost bypass enabled + remote request → requires cookie', () => {
    const options = createOptions({ localhostBypass: true });
    const req = createRequest('http://192.168.1.100:7680/bunterm');
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('valid cookie → authenticated', () => {
    const store = new InMemoryCookieSessionStore();
    const session = store.create(86400);
    const options = createOptions({ cookieSessionStore: store });
    const req = createRequest('http://example.com/bunterm', {
      Cookie: `bunterm_session=${session.id}`
    });
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(true);
  });

  it('invalid cookie → not authenticated', () => {
    const options = createOptions();
    const req = createRequest('http://example.com/bunterm', {
      Cookie: 'bunterm_session=invalid-session-id'
    });
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('expired cookie → not authenticated', () => {
    const store = new InMemoryCookieSessionStore();
    // Create a session with 0 TTL (immediately expired)
    const session = store.create(0);
    const options = createOptions({ cookieSessionStore: store });
    const req = createRequest('http://example.com/bunterm', {
      Cookie: `bunterm_session=${session.id}`
    });
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(false);
  });

  it('no cookie → not authenticated', () => {
    const options = createOptions();
    const req = createRequest('http://example.com/bunterm');
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(false);
    expect(result.reason).toBeDefined();
  });

  describe('stealth mode', () => {
    it('stealth off + unauthenticated → stealth is false', () => {
      const options = createOptions({ stealthMode: false });
      const req = createRequest('http://example.com/bunterm');
      const result = authenticateRequest(req, options);
      expect(result.authenticated).toBe(false);
      expect(result.stealth).toBe(false);
    });

    it('stealth on + unauthenticated (no cookie) → stealth is true', () => {
      const options = createOptions({ stealthMode: true });
      const req = createRequest('http://example.com/bunterm');
      const result = authenticateRequest(req, options);
      expect(result.authenticated).toBe(false);
      expect(result.stealth).toBe(true);
    });

    it('stealth on + invalid cookie → stealth is true', () => {
      const options = createOptions({ stealthMode: true });
      const req = createRequest('http://example.com/bunterm', {
        Cookie: 'bunterm_session=invalid-session-id'
      });
      const result = authenticateRequest(req, options);
      expect(result.authenticated).toBe(false);
      expect(result.stealth).toBe(true);
    });

    it('stealth on + valid cookie → authenticated (no stealth flag)', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(86400);
      const options = createOptions({ stealthMode: true, cookieSessionStore: store });
      const req = createRequest('http://example.com/bunterm', {
        Cookie: `bunterm_session=${session.id}`
      });
      const result = authenticateRequest(req, options);
      expect(result.authenticated).toBe(true);
      expect(result.stealth).toBeUndefined();
    });

    it('stealth on + localhost bypass → authenticated (no stealth flag)', () => {
      const options = createOptions({ stealthMode: true, localhostBypass: true });
      const req = createRequest('http://127.0.0.1:7680/bunterm');
      const result = authenticateRequest(req, options);
      expect(result.authenticated).toBe(true);
      expect(result.stealth).toBeUndefined();
    });
  });
});

// === authenticateRequest with proxy auth ===

describe('authenticateRequest with proxy auth', () => {
  it('trusted proxy + header → authenticated with proxyUser', () => {
    const options = createOptions({
      proxyAuth: {
        trustedProxies: ['10.0.0.1'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm', {
      'X-Forwarded-User': 'alice'
    });
    const result = authenticateRequest(req, options, '10.0.0.1');
    expect(result.authenticated).toBe(true);
    expect(result.proxyUser).toBe('alice');
  });

  it('untrusted proxy + header → falls through to cookie auth', () => {
    const options = createOptions({
      proxyAuth: {
        trustedProxies: ['10.0.0.1'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm', {
      'X-Forwarded-User': 'alice'
    });
    const result = authenticateRequest(req, options, '203.0.113.50');
    expect(result.authenticated).toBe(false);
    expect(result.proxyUser).toBeUndefined();
  });

  it('trusted proxy but no header → falls through to cookie auth', () => {
    const options = createOptions({
      proxyAuth: {
        trustedProxies: ['10.0.0.1'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm');
    const result = authenticateRequest(req, options, '10.0.0.1');
    expect(result.authenticated).toBe(false);
  });

  it('no remoteAddr → skips proxy auth, falls through to cookie', () => {
    const options = createOptions({
      proxyAuth: {
        trustedProxies: ['10.0.0.1'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm', {
      'X-Forwarded-User': 'alice'
    });
    const result = authenticateRequest(req, options);
    expect(result.authenticated).toBe(false);
  });

  it('proxy auth + valid cookie → proxy auth wins (checked first)', () => {
    const store = new InMemoryCookieSessionStore();
    const session = store.create(86400);
    const options = createOptions({
      cookieSessionStore: store,
      proxyAuth: {
        trustedProxies: ['10.0.0.1'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm', {
      'X-Forwarded-User': 'alice',
      Cookie: `bunterm_session=${session.id}`
    });
    const result = authenticateRequest(req, options, '10.0.0.1');
    expect(result.authenticated).toBe(true);
    expect(result.proxyUser).toBe('alice');
  });

  it('proxy auth with CIDR trusted proxy', () => {
    const options = createOptions({
      proxyAuth: {
        trustedProxies: ['10.0.0.0/8'],
        proxyHeader: 'X-Forwarded-User'
      }
    });
    const req = createRequest('http://example.com/bunterm', {
      'X-Forwarded-User': 'bob'
    });
    const result = authenticateRequest(req, options, '10.1.2.3');
    expect(result.authenticated).toBe(true);
    expect(result.proxyUser).toBe('bob');
  });
});

// === handleTokenExchange ===

describe('handleTokenExchange', () => {
  it('valid token → Set-Cookie + 302 redirect', async () => {
    const options = createOptions();
    const token = options.tokenGenerator.generate('__auth__');
    const req = createRequest(`http://example.com/bunterm/terminal?token=${token}`);
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(302);

    const setCookie = response!.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('bunterm_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/bunterm');
  });

  it('no token → returns null', async () => {
    const options = createOptions();
    const req = createRequest('http://example.com/bunterm/terminal');
    const response = await handleTokenExchange(req, options);
    expect(response).toBeNull();
  });

  it('invalid token → 401', async () => {
    const options = createOptions();
    const req = createRequest('http://example.com/bunterm/terminal?token=invalid-token');
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it('same token twice → second is rejected (replay prevention)', async () => {
    const options = createOptions();
    const token = options.tokenGenerator.generate('__auth__');

    const req1 = createRequest(`http://example.com/bunterm/terminal?token=${token}`);
    const response1 = await handleTokenExchange(req1, options);
    expect(response1).not.toBeNull();
    expect(response1!.status).toBe(302);

    const req2 = createRequest(`http://example.com/bunterm/terminal?token=${token}`);
    const response2 = await handleTokenExchange(req2, options);
    expect(response2).not.toBeNull();
    expect(response2!.status).toBe(401);
  });

  it('redirect URL has token removed', async () => {
    const options = createOptions();
    const token = options.tokenGenerator.generate('__auth__');
    const req = createRequest(`http://example.com/bunterm/terminal?token=${token}&other=value`);
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();

    const location = response!.headers.get('Location');
    expect(location).toBeTruthy();
    expect(location).not.toContain('token=');
    expect(location).toContain('other=value');
  });

  it('redirect URL with only token param has clean URL', async () => {
    const options = createOptions();
    const token = options.tokenGenerator.generate('__auth__');
    const req = createRequest(`http://example.com/bunterm/terminal?token=${token}`);
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();

    const location = response!.headers.get('Location');
    expect(location).toBeTruthy();
    expect(location).not.toContain('?');
    expect(location).toBe('http://example.com/bunterm/terminal');
  });

  it('stealth mode + invalid token → 404 instead of 401', async () => {
    const options = createOptions({ stealthMode: true });
    const req = createRequest('http://example.com/bunterm/terminal?token=invalid-token');
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  it('stealth mode off + invalid token → 401', async () => {
    const options = createOptions({ stealthMode: false });
    const req = createRequest('http://example.com/bunterm/terminal?token=invalid-token');
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it('secure cookie when secureCookie is true', async () => {
    const options = createOptions({ secureCookie: true });
    const token = options.tokenGenerator.generate('__auth__');
    const req = createRequest(`http://example.com/bunterm/terminal?token=${token}`);
    const response = await handleTokenExchange(req, options);
    expect(response).not.toBeNull();

    const setCookie = response!.headers.get('Set-Cookie');
    expect(setCookie).toContain('Secure');
  });
});
