/**
 * Security Headers Plugin Tests
 *
 * Verifies that the securityHeadersPlugin adds all required security headers
 * and that CSP varies correctly based on sentryEnabled state and nonce.
 */

import { describe, expect, test } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { Elysia } from 'elysia';
import { buildCsp, securityHeadersPlugin } from './security-headers.js';

// === Helper ===

function createApp(sentryEnabled = false) {
  const app = new Elysia()
    .state('sentryEnabled', sentryEnabled)
    .use(securityHeadersPlugin)
    .get('/test', () => ({ ok: true }));
  return treaty(app);
}

// === Tests ===

describe('buildCsp', () => {
  describe('without nonce', () => {
    test('contains unsafe-inline when no nonce provided', () => {
      const csp = buildCsp(false);
      expect(csp).toContain("'unsafe-inline'");
    });

    test('does not contain nonce directive', () => {
      const csp = buildCsp(false);
      expect(csp).not.toContain("'nonce-");
    });
  });

  describe('with nonce', () => {
    test('replaces unsafe-inline with nonce in script-src', () => {
      const nonce = 'abc123testNonce==';
      const csp = buildCsp(false, nonce);
      expect(csp).toContain(`'nonce-${nonce}'`);
      // script-src should not contain 'unsafe-inline'; style-src still may
      const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
    });

    test('nonce appears in script-src directive', () => {
      const nonce = 'testNonce12345==';
      const csp = buildCsp(false, nonce);
      expect(csp).toMatch(/script-src 'self' 'nonce-testNonce12345=='/);
    });

    test('nonce works together with Sentry domains', () => {
      const nonce = 'sentryNonce==';
      const csp = buildCsp(true, nonce);
      expect(csp).toContain(`'nonce-${nonce}'`);
      expect(csp).toContain('https://js.sentry-cdn.com');
      // Only script-src should not contain 'unsafe-inline'; style-src still uses it
      const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
    });

    test('full CSP value without Sentry, with nonce', () => {
      const nonce = 'myNonce==';
      const csp = buildCsp(false, nonce);
      expect(csp).toBe(
        `default-src 'self'; script-src 'self' 'nonce-myNonce=='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-src 'self'`
      );
    });

    test('full CSP value with Sentry, with nonce', () => {
      const nonce = 'myNonce==';
      const csp = buildCsp(true, nonce);
      expect(csp).toBe(
        `default-src 'self'; script-src 'self' 'nonce-myNonce==' https://js.sentry-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://*.ingest.sentry.io; frame-src 'self'`
      );
    });
  });
});

describe('securityHeadersPlugin', () => {
  describe('default (sentryEnabled = false)', () => {
    const client = createApp(false);

    test('sets X-Content-Type-Options to nosniff', async () => {
      const res = await client.test.get();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    test('sets X-Frame-Options to SAMEORIGIN', async () => {
      const res = await client.test.get();
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    });

    test('sets Referrer-Policy', async () => {
      const res = await client.test.get();
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    test('sets Permissions-Policy', async () => {
      const res = await client.test.get();
      expect(res.headers.get('permissions-policy')).toBe(
        'geolocation=(), microphone=(), camera=(), payment=()'
      );
    });

    test('sets CSP without Sentry domains', async () => {
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).not.toBeNull();
      expect(csp).not.toContain('sentry');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });
  });

  describe('sentryEnabled = true', () => {
    const client = createApp(true);

    test('CSP includes Sentry script-src', async () => {
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain('https://js.sentry-cdn.com');
    });

    test('CSP includes Sentry connect-src', async () => {
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain('https://*.ingest.sentry.io');
    });

    test('still sets all other security headers', async () => {
      const res = await client.test.get();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toBe(
        'geolocation=(), microphone=(), camera=(), payment=()'
      );
    });
  });

  describe('nonce propagation via store.cspNonce', () => {
    test('CSP contains the nonce from store when nonce is set', async () => {
      const nonce = 'storeNonce12345==';
      const app = new Elysia()
        .state('sentryEnabled', false)
        .state('cspNonce', nonce)
        .use(securityHeadersPlugin)
        .get('/test', () => ({ ok: true }));
      const client = treaty(app);
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain(`'nonce-${nonce}'`);
      // Only script-src should not contain 'unsafe-inline'; style-src still uses it
      const scriptSrcMatch = csp!.match(/script-src ([^;]+)/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
    });

    test('CSP falls back to unsafe-inline when no nonce in store', async () => {
      const app = new Elysia()
        .state('sentryEnabled', false)
        .use(securityHeadersPlugin)
        .get('/test', () => ({ ok: true }));
      const client = treaty(app);
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).toContain("'unsafe-inline'");
    });

    test('each request gets the nonce set in that request store', async () => {
      const nonce1 = 'nonceForRequest1==';
      const nonce2 = 'nonceForRequest2==';

      // Simulate per-request nonce via derive
      const app = new Elysia()
        .state('sentryEnabled', false)
        .state('cspNonce', '')
        .derive(() => {
          // In real usage this would be randomBytes per request; here we use fixed nonces for testing
          return {};
        })
        .use(securityHeadersPlugin)
        .get('/test1', ({ store }) => {
          store.cspNonce = nonce1;
          return { ok: true };
        })
        .get('/test2', ({ store }) => {
          store.cspNonce = nonce2;
          return { ok: true };
        });

      const client = treaty(app);
      const res1 = await client.test1.get();
      const res2 = await client.test2.get();

      // Note: onAfterHandle runs after the route handler, so nonces set in handler are visible
      expect(res1.headers.get('content-security-policy')).toContain(`'nonce-${nonce1}'`);
      expect(res2.headers.get('content-security-policy')).toContain(`'nonce-${nonce2}'`);
    });
  });
});
