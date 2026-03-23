/**
 * Auth Middleware
 *
 * Request authentication via cookie sessions and one-time token exchange.
 * Supports localhost bypass and configurable cookie attributes.
 */

import type { TokenGenerator } from '@/core/server/ws/session-token.js';
import type { CookieSessionStore } from './cookie-session.js';
import { buildSetCookieHeader, extractSessionCookie } from './cookie-session.js';
import { classifyNetwork, type NetworkZone } from './network-classifier.js';
import { extractProxyUser, type ProxyAuthOptions } from './proxy-auth.js';

// === Types ===

export interface AuthMiddlewareOptions {
  enabled: boolean;
  localhostBypass: boolean;
  cookieSessionStore: CookieSessionStore;
  tokenGenerator: TokenGenerator;
  basePath: string;
  cookieName: string;
  sessionTtlSeconds: number;
  /** Set to true when hostname is configured (HTTPS) */
  secureCookie: boolean;
  /** When true, unauthenticated requests get 404 instead of 401 to hide bunterm's existence */
  stealthMode: boolean;
  /** Proxy auth options. When set, trusted proxies can authenticate via header. */
  proxyAuth?: ProxyAuthOptions;
  /** When true, session TTL varies by network zone */
  adaptiveShield: boolean;
  /** Session TTL for LAN connections (default: 12 hours) */
  lanSessionTtlSeconds: number;
  /** Session TTL for Internet connections (default: 1 hour) */
  internetSessionTtlSeconds: number;
}

export interface AuthResult {
  authenticated: boolean;
  reason?: string;
  /** When true, the server should return 404 instead of 401 to hide its existence */
  stealth?: boolean;
  /** Username from trusted proxy header, if proxy auth was used */
  proxyUser?: string;
  /** Detected network zone when adaptive shield is active */
  networkZone?: NetworkZone;
}

// === Localhost Detection ===

const LOCALHOST_ADDRESSES = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Determine if the request originates from localhost based on the URL hostname.
 *
 * NOTE: X-Forwarded-For is intentionally NOT checked here.
 * Any client can forge X-Forwarded-For headers, so trusting them for an auth
 * bypass decision would allow remote attackers to spoof localhost identity.
 * Only the URL hostname (derived from the Host header) is checked.
 */
export function isLocalhost(req: Request): boolean {
  const url = new URL(req.url);
  // Strip IPv6 brackets (e.g., "[::1]" → "::1")
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  return LOCALHOST_ADDRESSES.has(hostname);
}

// === Authentication ===

/**
 * Authenticate a request using cookie session.
 * - auth disabled → always authenticated
 * - localhost bypass → local connections skip auth
 * - Otherwise validates session cookie via CookieSessionStore
 */
export function authenticateRequest(
  req: Request,
  options: AuthMiddlewareOptions,
  remoteAddr?: string
): AuthResult {
  if (!options.enabled) {
    return { authenticated: true };
  }

  if (options.localhostBypass && isLocalhost(req)) {
    return { authenticated: true };
  }

  // Check proxy auth (trusted reverse proxy with user header)
  if (options.proxyAuth && remoteAddr) {
    const proxyUser = extractProxyUser(req, remoteAddr, options.proxyAuth);
    if (proxyUser) {
      return { authenticated: true, proxyUser };
    }
  }

  // Adaptive Shield: classify network zone
  const networkZone: NetworkZone | undefined =
    options.adaptiveShield && remoteAddr ? classifyNetwork(remoteAddr) : undefined;

  // Internet zone requires OTP — cookie alone is insufficient
  if (networkZone === 'internet') {
    return {
      authenticated: false,
      reason: 'otp_required',
      stealth: options.stealthMode,
      networkZone
    };
  }

  const sessionId = extractSessionCookie(req, options.cookieName);
  if (!sessionId) {
    return {
      authenticated: false,
      reason: 'no_session_cookie',
      stealth: options.stealthMode,
      networkZone
    };
  }

  if (!options.cookieSessionStore.validate(sessionId)) {
    return {
      authenticated: false,
      reason: 'invalid_or_expired_session',
      stealth: options.stealthMode,
      networkZone
    };
  }

  return { authenticated: true, networkZone };
}

// === Token Exchange ===

/**
 * Handle one-time token exchange via URL query parameter.
 * - No token → returns null (proceed with normal request handling)
 * - Valid token → creates session, returns 302 redirect with Set-Cookie
 * - Invalid token → returns 401
 */
/**
 * Resolve session TTL based on network zone when adaptive shield is active.
 */
export function resolveSessionTtl(options: AuthMiddlewareOptions, remoteAddr?: string): number {
  if (!options.adaptiveShield || !remoteAddr) {
    return options.sessionTtlSeconds;
  }
  const zone = classifyNetwork(remoteAddr);
  switch (zone) {
    case 'localhost':
      return options.sessionTtlSeconds;
    case 'lan':
      return options.lanSessionTtlSeconds;
    case 'internet':
      return options.internetSessionTtlSeconds;
  }
}

export async function handleTokenExchange(
  req: Request,
  options: AuthMiddlewareOptions,
  remoteAddr?: string
): Promise<Response | null> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return null;
  }

  const validation = await options.tokenGenerator.validate(token);
  if (!validation.valid) {
    if (options.stealthMode) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response('Unauthorized', { status: 401 });
  }

  // Use adaptive TTL when enabled
  const ttl = resolveSessionTtl(options, remoteAddr);

  // Create a new cookie session
  const session = options.cookieSessionStore.create(ttl, remoteAddr);

  // Build Set-Cookie header
  const setCookie = buildSetCookieHeader(options.cookieName, session.id, {
    httpOnly: true,
    sameSite: 'Strict',
    path: options.basePath,
    maxAge: ttl,
    secure: options.secureCookie
  });

  // Build redirect URL without token parameter
  url.searchParams.delete('token');
  const redirectUrl = url.toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl,
      'Set-Cookie': setCookie
    }
  });
}
