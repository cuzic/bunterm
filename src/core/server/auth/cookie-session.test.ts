import { describe, expect, it } from 'bun:test';
import {
  buildSetCookieHeader,
  clearCookieHeader,
  extractSessionCookie,
  InMemoryCookieSessionStore,
  parseCookies
} from './cookie-session.js';

describe('InMemoryCookieSessionStore', () => {
  describe('create', () => {
    it('should create a session with a random hex ID', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(3600);

      expect(session.id).toBeString();
      expect(session.id).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(session.id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should set createdAt to current time', () => {
      const store = new InMemoryCookieSessionStore();
      const before = Date.now();
      const session = store.create(3600);
      const after = Date.now();

      expect(session.createdAt).toBeGreaterThanOrEqual(before);
      expect(session.createdAt).toBeLessThanOrEqual(after);
    });

    it('should set expiresAt based on ttlSeconds', () => {
      const store = new InMemoryCookieSessionStore();
      const before = Date.now();
      const session = store.create(3600);

      expect(session.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(session.expiresAt).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
    });

    it('should generate unique IDs for each session', () => {
      const store = new InMemoryCookieSessionStore();
      const s1 = store.create(3600);
      const s2 = store.create(3600);

      expect(s1.id).not.toBe(s2.id);
    });

    it('should store remoteAddr when provided', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(3600, '192.168.1.100');

      expect(session.remoteAddr).toBe('192.168.1.100');
    });

    it('should default remoteAddr to unknown when not provided', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(3600);

      expect(session.remoteAddr).toBe('unknown');
    });
  });

  describe('validate', () => {
    it('should return true for a valid session', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(3600);

      expect(store.validate(session.id)).toBe(true);
    });

    it('should return false for an unknown session ID', () => {
      const store = new InMemoryCookieSessionStore();

      expect(store.validate('nonexistent')).toBe(false);
    });

    it('should return false for an expired session', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(0); // expires immediately

      // Allow a tiny bit of time to pass
      expect(store.validate(session.id)).toBe(false);
    });
  });

  describe('revoke', () => {
    it('should invalidate a session after revocation', () => {
      const store = new InMemoryCookieSessionStore();
      const session = store.create(3600);

      expect(store.validate(session.id)).toBe(true);
      store.revoke(session.id);
      expect(store.validate(session.id)).toBe(false);
    });

    it('should not throw when revoking a nonexistent session', () => {
      const store = new InMemoryCookieSessionStore();

      expect(() => store.revoke('nonexistent')).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should remove expired sessions and return the count', () => {
      const store = new InMemoryCookieSessionStore();

      // Create sessions that expire immediately
      store.create(0);
      store.create(0);
      // Create a session that does not expire
      store.create(3600);

      const removed = store.cleanup();

      expect(removed).toBe(2);
      expect(store.size).toBe(1);
    });

    it('should return 0 when no sessions are expired', () => {
      const store = new InMemoryCookieSessionStore();
      store.create(3600);

      const removed = store.cleanup();

      expect(removed).toBe(0);
      expect(store.size).toBe(1);
    });
  });

  describe('listSessions', () => {
    it('should return all valid sessions', () => {
      const store = new InMemoryCookieSessionStore();
      const s1 = store.create(3600, '10.0.0.1');
      const s2 = store.create(3600, '10.0.0.2');

      const sessions = store.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    });

    it('should exclude expired sessions', () => {
      const store = new InMemoryCookieSessionStore();
      store.create(0, '10.0.0.1'); // expires immediately
      const valid = store.create(3600, '10.0.0.2');

      const sessions = store.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(valid.id);
    });

    it('should return empty array when no sessions exist', () => {
      const store = new InMemoryCookieSessionStore();

      expect(store.listSessions()).toEqual([]);
    });
  });
});

describe('parseCookies', () => {
  it('should parse a simple cookie string', () => {
    const result = parseCookies('a=1; b=2');

    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should handle a single cookie', () => {
    const result = parseCookies('session=abc123');

    expect(result).toEqual({ session: 'abc123' });
  });

  it('should handle empty string', () => {
    const result = parseCookies('');

    expect(result).toEqual({});
  });

  it('should handle cookies with spaces', () => {
    const result = parseCookies('  a = 1 ;  b = 2  ');

    expect(result).toEqual({ a: '1', b: '2' });
  });

  it('should handle cookies with equals in value', () => {
    const result = parseCookies('token=abc=def=ghi');

    expect(result).toEqual({ token: 'abc=def=ghi' });
  });
});

describe('buildSetCookieHeader', () => {
  it('should build a basic Set-Cookie header', () => {
    const header = buildSetCookieHeader('session', 'abc123', {});

    expect(header).toBe('session=abc123');
  });

  it('should include HttpOnly flag', () => {
    const header = buildSetCookieHeader('session', 'abc123', { httpOnly: true });

    expect(header).toContain('HttpOnly');
  });

  it('should include Secure flag', () => {
    const header = buildSetCookieHeader('session', 'abc123', { secure: true });

    expect(header).toContain('Secure');
  });

  it('should include SameSite attribute', () => {
    const header = buildSetCookieHeader('session', 'abc123', {
      sameSite: 'Strict'
    });

    expect(header).toContain('SameSite=Strict');
  });

  it('should include Path attribute', () => {
    const header = buildSetCookieHeader('session', 'abc123', {
      path: '/bunterm'
    });

    expect(header).toContain('Path=/bunterm');
  });

  it('should include Max-Age attribute', () => {
    const header = buildSetCookieHeader('session', 'abc123', {
      maxAge: 3600
    });

    expect(header).toContain('Max-Age=3600');
  });

  it('should combine all options', () => {
    const header = buildSetCookieHeader('sid', 'xyz', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 7200
    });

    expect(header).toBe('sid=xyz; Path=/; Max-Age=7200; HttpOnly; Secure; SameSite=Lax');
  });
});

describe('clearCookieHeader', () => {
  it('should build a header that clears the cookie', () => {
    const header = clearCookieHeader('session', '/bunterm');

    expect(header).toContain('session=');
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Path=/bunterm');
  });
});

describe('extractSessionCookie', () => {
  it('should extract a session cookie from a Request', () => {
    const req = new Request('http://localhost/', {
      headers: { Cookie: 'session=abc123; other=xyz' }
    });

    const value = extractSessionCookie(req, 'session');

    expect(value).toBe('abc123');
  });

  it('should return null when cookie is not present', () => {
    const req = new Request('http://localhost/', {
      headers: { Cookie: 'other=xyz' }
    });

    const value = extractSessionCookie(req, 'session');

    expect(value).toBeNull();
  });

  it('should return null when no Cookie header exists', () => {
    const req = new Request('http://localhost/');

    const value = extractSessionCookie(req, 'session');

    expect(value).toBeNull();
  });
});
