/**
 * Elysia Rate Limiter Plugin
 *
 * IP-based rate limiting for API endpoints using SlidingWindowRateLimiter.
 * Applies per-category limits matching the existing server.ts behavior.
 */

import { Elysia } from 'elysia';
import { SlidingWindowRateLimiter } from '@/core/server/auth/rate-limiter.js';

// Rate limiter instances per endpoint category
const sessionCreateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 5 // Session creation: 5 req/min per IP
});

const fileUploadLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 20 // File upload: 20 req/min per IP
});

const aiLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 10 // AI endpoints: 10 req/min per IP
});

const getLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 60 // GET endpoints: 60 req/min per IP
});

const mutateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 30 // POST/PUT/DELETE endpoints: 30 req/min per IP
});

const allLimiters = [sessionCreateLimiter, fileUploadLimiter, aiLimiter, getLimiter, mutateLimiter];

// Periodic cleanup of expired rate limit entries (every 5 minutes)
const cleanupInterval = setInterval(() => {
  for (const limiter of allLimiters) {
    limiter.cleanup();
  }
}, 5 * 60_000);

// Prevent the interval from keeping the process alive
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Select the appropriate rate limiter for a given API path and HTTP method.
 * Returns null if no rate limiting applies.
 */
function selectLimiter(apiPath: string, method: string): SlidingWindowRateLimiter | null {
  // Session creation (POST /api/sessions) — 5 req/min
  if (apiPath === '/sessions' && method === 'POST') {
    return sessionCreateLimiter;
  }

  // File upload (POST /api/files/upload, /api/clipboard-image) — 20 req/min
  if ((apiPath === '/files/upload' || apiPath === '/clipboard-image') && method === 'POST') {
    return fileUploadLimiter;
  }

  // AI endpoints (POST /api/ai/*) — 10 req/min
  if (apiPath.startsWith('/ai/') && method === 'POST') {
    return aiLimiter;
  }

  // General GET — 60 req/min
  if (method === 'GET') {
    return getLimiter;
  }

  // General mutation (POST/PUT/DELETE) — 30 req/min
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    return mutateLimiter;
  }

  return null;
}

/**
 * Extract client IP address from the request.
 *
 * SECURITY NOTE: This function trusts X-Real-IP and X-Forwarded-For headers
 * unconditionally. This is acceptable because:
 * 1. bunterm defaults to localhost-only binding (listen_addresses: ['127.0.0.1', '::1']),
 *    so only local processes (or a trusted reverse proxy) can reach the server.
 * 2. When exposed via a reverse proxy (e.g., Caddy with listen_sockets), the proxy
 *    is trusted to set accurate forwarding headers.
 * 3. The auth middleware (OTP/session tokens) prevents unauthorized access regardless.
 *
 * If bunterm is ever exposed directly to untrusted networks, proxy header trust
 * must be gated on a `trusted_proxies` configuration to prevent IP spoofing
 * that could bypass rate limits.
 */
function extractClientIp(request: Request): string {
  // Check X-Real-IP first (typically set by nginx/Caddy)
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback: first address in X-Forwarded-For
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return 'unknown';
}

export const rateLimiterPlugin = new Elysia({ name: 'rate-limiter' })
  .onBeforeHandle(({ request, set }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only rate-limit /api/ routes
    // Strip base path prefix to get the API path portion
    const apiIndex = path.indexOf('/api/');
    if (apiIndex === -1) {
      return;
    }
    const apiPath = path.slice(apiIndex + '/api'.length);
    const method = request.method;

    const limiter = selectLimiter(apiPath, method);
    if (!limiter) {
      return;
    }

    const clientIp = extractClientIp(request);

    if (!limiter.isAllowed(clientIp)) {
      set.status = 429;
      set.headers['Content-Type'] = 'application/json';
      set.headers['Retry-After'] = '60';
      return { error: 'Too Many Requests' };
    }
    return;
  })
  .as('global');
