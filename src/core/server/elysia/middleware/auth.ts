/**
 * Elysia Auth Middleware Plugin
 *
 * Wraps the existing auth-middleware.ts logic into an Elysia plugin.
 * Uses derive() to add `authenticated` and `proxyUser` to the request context.
 *
 * Auth check order:
 * 1. Localhost bypass (if enabled)
 * 2. Proxy auth headers (trusted reverse proxy)
 * 3. Cookie session validation
 * 4. OTP token exchange via query parameter
 * 5. Stealth mode: 404 instead of 401 for unauthenticated requests
 */

import { Elysia } from 'elysia';
import {
  type AuthMiddlewareOptions,
  type AuthResult,
  authenticateRequest,
  handleTokenExchange
} from '@/core/server/auth/auth-middleware.js';
import type { NetworkZone } from '@/core/server/auth/network-classifier.js';

export interface AuthContext {
  readonly authenticated: boolean;
  readonly proxyUser?: string;
  readonly networkZone?: NetworkZone;
}

/**
 * Elysia auth plugin.
 *
 * Expects `authOptions` in store (set via .state() before .use(authPlugin)).
 * Derives `authenticated`, `proxyUser`, and `networkZone` into the request context.
 *
 * Token exchange (OTP via ?token= query param) is handled as a beforeHandle hook
 * that short-circuits with a redirect response when a valid token is present.
 */
export const authPlugin = new Elysia({ name: 'auth' })
  .state('authOptions', null as AuthMiddlewareOptions | null)
  .onBeforeHandle(async ({ request, store }) => {
    const options = store.authOptions;
    if (!options?.enabled) {
      return undefined;
    }

    // Handle OTP token exchange — returns a redirect Response or null
    const remoteAddr = extractRemoteAddr(request);
    const tokenResponse = await handleTokenExchange(request, options, remoteAddr);
    if (tokenResponse) {
      // Short-circuit: return the redirect response directly
      return new Response(null, {
        status: tokenResponse.status,
        headers: Object.fromEntries(tokenResponse.headers.entries())
      });
    }
    return undefined;
  })
  .derive(({ request, store }) => {
    const options = store.authOptions;

    // Auth disabled or not configured — allow all
    if (!options?.enabled) {
      return {
        authenticated: true as boolean,
        proxyUser: undefined as string | undefined,
        networkZone: undefined as NetworkZone | undefined
      };
    }

    const remoteAddr = extractRemoteAddr(request);
    const result: AuthResult = authenticateRequest(request, options, remoteAddr);

    return {
      authenticated: result.authenticated,
      proxyUser: result.proxyUser,
      networkZone: result.networkZone
    };
  })
  .onBeforeHandle(({ authenticated, set, store, request }) => {
    const authOptions = store.authOptions as AuthMiddlewareOptions | null;
    if (!authOptions?.enabled) return; // auth disabled, allow all
    if (authenticated) return; // authenticated, allow

    // Exempt paths: OTP token exchange, WebSocket token
    const url = new URL(request.url);
    if (url.pathname.includes('/auth/otp') || url.pathname.includes('/auth/ws-token')) return;

    if (authOptions.stealthMode) {
      set.status = 404;
      return 'Not Found';
    }
    set.status = 401;
    return { error: 'UNAUTHORIZED', message: 'Authentication required' };
  })
  .as('global');

/**
 * Extract remote address from the request.
 * Bun's server passes remoteAddress on the Request object at runtime,
 * but it's not in the standard Request type.
 */
function extractRemoteAddr(request: Request): string | undefined {
  // Bun attaches remoteAddress to the server request object
  return (request as Request & { remoteAddress?: string }).remoteAddress;
}
