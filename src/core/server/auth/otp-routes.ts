/**
 * OTP Auth API Routes
 *
 * Endpoints for OTP generation (internal/localhost) and verification (public).
 * OTP verification issues a cookie session on success.
 *
 * - Generate: registered in API route registry, accessed via localhost (auth bypass)
 * - Verify: handled as special route in server.ts (pre-auth, needs Set-Cookie header)
 */

import { z } from 'zod';
import { unauthorized } from '@/core/errors.js';
import type { RouteDef } from '@/core/server/http/route-types.js';
import { err, ok } from '@/utils/result.js';
import { isLocalhost } from './auth-middleware.js';
import type { CookieSessionStore } from './cookie-session.js';
import { buildSetCookieHeader } from './cookie-session.js';
import type { OtpManager } from './otp-manager.js';

// === Types ===

export interface OtpRouteDeps {
  otpManager: OtpManager;
  cookieSessionStore: CookieSessionStore;
  cookieName: string;
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

// === Singleton ===

let otpRouteDepsInstance: OtpRouteDeps | null = null;

/** Set OTP route deps (called from server.ts during init) */
export function setOtpRouteDeps(deps: OtpRouteDeps): void {
  otpRouteDepsInstance = deps;
}

// === Schemas ===

const OtpVerifyBodySchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Must be 6 digits')
});

// === Response Types ===

interface OtpGenerateResponse {
  code: string;
  expiresAt: number;
  ttlSeconds: number;
}

// === Routes (for RouteRegistry) ===

/**
 * OTP generate route.
 * Registered in the API route registry. Accessible via localhost auth bypass.
 */
export const otpRoutes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/auth/otp/generate',
    description: 'Generate a 6-digit OTP (localhost only)',
    tags: ['auth', 'otp'],
    handler: async (ctx) => {
      const deps = otpRouteDepsInstance;
      if (!deps) {
        return err(unauthorized('OTP is not configured'));
      }

      // Only allow from localhost
      if (!isLocalhost(ctx.req)) {
        return err(unauthorized('OTP generation is only available from localhost'));
      }

      const url = new URL(ctx.req.url);
      const ttl = Number(url.searchParams.get('ttl')) || 60;
      const clampedTtl = Math.min(Math.max(ttl, 10), 300);

      const result = deps.otpManager.generate(clampedTtl);

      return ok<OtpGenerateResponse>({
        code: result.code,
        expiresAt: result.expiresAt,
        ttlSeconds: result.ttlSeconds
      });
    }
  }
];

// === Special Handler (pre-auth) ===

/**
 * Handle OTP verify as a special route (returns raw Response with Set-Cookie).
 * Called from server.ts before auth middleware, since unauthenticated users need access.
 */
export async function handleOtpVerify(
  req: Request,
  deps: OtpRouteDeps,
  basePath: string,
  remoteAddr?: string
): Promise<Response | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (req.method !== 'POST' || pathname !== `${basePath}/api/auth/otp/verify`) {
    return null;
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body' }
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = OtpVerifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'VALIDATION_FAILED', message: 'Must be a 6-digit code' }
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const result = deps.otpManager.validate(parsed.data.code);

  if (!result.valid) {
    const messages: Record<string, string> = {
      invalid_code: 'Invalid code. Please try again.',
      expired: 'Code has expired. Run "bunterm otp" to generate a new one.',
      already_used: 'Code has already been used. Run "bunterm otp" to generate a new one.',
      locked_out: `Too many failed attempts. Try again in ${deps.otpManager.lockoutRemainingSeconds()} seconds.`,
      no_active_otp: 'No active code. Run "bunterm otp" to generate one.'
    };
    const message = messages[result.reason ?? 'invalid_code'] ?? 'Invalid code';
    return new Response(
      JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create cookie session
  const session = deps.cookieSessionStore.create(deps.sessionTtlSeconds, remoteAddr);
  const setCookie = buildSetCookieHeader(deps.cookieName, session.id, {
    httpOnly: true,
    sameSite: 'Strict',
    path: basePath,
    maxAge: deps.sessionTtlSeconds,
    secure: deps.secureCookie
  });

  return new Response(JSON.stringify({ success: true, data: { authenticated: true } }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie
    }
  });
}
