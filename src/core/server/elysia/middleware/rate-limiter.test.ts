import { afterEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { SlidingWindowRateLimiter } from '@/core/server/auth/rate-limiter.js';

/**
 * Build a test-scoped rate limiter plugin with low limits for fast tests.
 * Each call returns a fresh plugin with fresh limiter instances.
 */
function createTestRateLimiterPlugin(maxRequests = 2) {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 60_000,
    maxRequests
  });

  const plugin = new Elysia({ name: 'rate-limiter-test' })
    .onBeforeHandle(({ request, set }) => {
      const clientIp =
        request.headers.get('x-real-ip') ??
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'test-client';

      if (!limiter.isAllowed(clientIp)) {
        set.status = 429;
        set.headers['Content-Type'] = 'application/json';
        set.headers['Retry-After'] = '60';
        return { error: 'Too Many Requests' };
      }
    })
    .as('global');

  return { plugin, limiter };
}

/** Helper to make a GET request via app.handle */
function get(app: Elysia, headers?: Record<string, string>): Promise<Response> {
  return app.handle(new Request('http://localhost/api/test', { headers }));
}

/** Helper to make a POST request via app.handle */
function post(app: Elysia, headers?: Record<string, string>): Promise<Response> {
  return app.handle(new Request('http://localhost/api/test', { method: 'POST', headers }));
}

/**
 * Create a minimal Elysia app with the rate limiter plugin and a test route.
 */
function createTestApp(maxRequests = 2) {
  const { plugin, limiter } = createTestRateLimiterPlugin(maxRequests);

  const app = new Elysia()
    .use(plugin)
    .get('/api/test', () => ({ ok: true }))
    .post('/api/test', () => ({ ok: true }));

  return { app, limiter };
}

describe('rate-limiter plugin', () => {
  let limiter: SlidingWindowRateLimiter | undefined;

  afterEach(() => {
    limiter?.dispose();
    limiter = undefined;
  });

  describe('requests within limit', () => {
    test('allows requests under the limit', async () => {
      const ctx = createTestApp(2);
      limiter = ctx.limiter;

      const res1 = await get(ctx.app);
      expect(res1.status).toBe(200);
      expect(await res1.json()).toEqual({ ok: true });

      const res2 = await get(ctx.app);
      expect(res2.status).toBe(200);
    });

    test('allows POST requests under the limit', async () => {
      const ctx = createTestApp(2);
      limiter = ctx.limiter;

      const res = await post(ctx.app);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  describe('requests exceeding limit', () => {
    test('returns 429 when limit is exceeded', async () => {
      const ctx = createTestApp(2);
      limiter = ctx.limiter;

      // Exhaust the limit
      await get(ctx.app);
      await get(ctx.app);

      // Third request should be rate limited
      const res = await get(ctx.app);
      expect(res.status).toBe(429);
    });

    test('429 response includes Retry-After header', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      await get(ctx.app);

      const res = await get(ctx.app);
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('60');
    });

    test('429 response body contains error message', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      await get(ctx.app);

      const res = await get(ctx.app);
      expect(res.status).toBe(429);

      const body = await res.json();
      expect(body.error).toBe('Too Many Requests');
    });

    test('POST requests are also rate limited', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      await post(ctx.app);

      const res = await post(ctx.app);
      expect(res.status).toBe(429);
    });
  });

  describe('IP-based isolation', () => {
    test('rate limits are per-IP', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      // First IP exhausts limit
      const res1 = await get(ctx.app, { 'x-real-ip': '1.1.1.1' });
      expect(res1.status).toBe(200);

      // First IP is now rate limited
      const res2 = await get(ctx.app, { 'x-real-ip': '1.1.1.1' });
      expect(res2.status).toBe(429);

      // Second IP still has quota
      const res3 = await get(ctx.app, { 'x-real-ip': '2.2.2.2' });
      expect(res3.status).toBe(200);
    });

    test('extracts IP from x-forwarded-for header', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      // Use x-forwarded-for with multiple IPs (should use first)
      const res1 = await get(ctx.app, { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' });
      expect(res1.status).toBe(200);

      // Same first IP should be rate limited
      const res2 = await get(ctx.app, { 'x-forwarded-for': '10.0.0.1, 10.0.0.99' });
      expect(res2.status).toBe(429);
    });

    test('x-real-ip takes precedence over x-forwarded-for', async () => {
      const ctx = createTestApp(1);
      limiter = ctx.limiter;

      // Exhaust limit for x-real-ip address
      await get(ctx.app, { 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '9.9.9.9' });

      // Same x-real-ip but different x-forwarded-for → should be limited
      const res = await get(ctx.app, { 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '8.8.8.8' });
      expect(res.status).toBe(429);
    });
  });
});
