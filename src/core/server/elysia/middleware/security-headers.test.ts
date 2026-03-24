/**
 * Security Headers Plugin Tests
 *
 * Verifies that the securityHeadersPlugin adds all required security headers
 * and that CSP varies correctly based on sentryEnabled state.
 */

import { describe, expect, test } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { Elysia } from 'elysia';
import { securityHeadersPlugin } from './security-headers.js';

// === Helper ===

function createApp(sentryEnabled = false) {
  const app = new Elysia()
    .state('sentryEnabled', sentryEnabled)
    .use(securityHeadersPlugin)
    .get('/test', () => ({ ok: true }));
  return treaty(app);
}

// === Tests ===

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
      expect(csp).toBe(
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-src 'self'"
      );
      expect(csp).not.toContain('sentry');
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

    test('CSP has full expected value with Sentry', async () => {
      const res = await client.test.get();
      const csp = res.headers.get('content-security-policy');
      expect(csp).toBe(
        "default-src 'self'; script-src 'self' https://js.sentry-cdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https://*.ingest.sentry.io; frame-src 'self'"
      );
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
});
