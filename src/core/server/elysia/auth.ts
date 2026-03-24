/**
 * Auth API Routes (Elysia)
 *
 * Handles authentication: WebSocket token generation.
 * Replaces the old auth-routes.ts with Elysia's TypeBox validation.
 */

import { Elysia, t } from 'elysia';
import { coreContext } from './context.js';
import { ErrorResponseSchema } from './errors.js';

// === Response Schemas ===

const WsTokenResponseSchema = t.Object({
  token: t.String(),
  sessionId: t.String(),
  expiresIn: t.Number()
});

// === Plugin ===

export const authRoutesPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // POST /api/auth/ws-token - Generate WebSocket authentication token
  .post(
    '/auth/ws-token',
    async ({ sessionManager, body, error }) => {
      const { sessionId, userId } = body;

      if (!sessionManager.hasSession(sessionId)) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionId}' not found`
        });
      }

      const { getTokenGenerator } = await import('@/core/server/ws/session-token.js');
      const tokenGenerator = getTokenGenerator();
      const token = tokenGenerator.generate(sessionId, userId);

      return {
        token,
        sessionId,
        expiresIn: 30
      };
    },
    {
      body: t.Object({
        sessionId: t.String({ minLength: 1 }),
        userId: t.Optional(t.String())
      }),
      response: {
        200: WsTokenResponseSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // POST /api/auth/otp/generate - Generate a 6-digit OTP for browser authentication
  .post(
    '/auth/otp/generate',
    async ({ query, store, error }) => {
      const s = store as Record<string, unknown>;
      const otpManager = s['otpManager'] as
        | import('@/core/server/auth/otp-manager.js').OtpManager
        | undefined;
      if (!otpManager) {
        return error(500, { error: 'OTP_NOT_CONFIGURED', message: 'OTP manager not initialized' });
      }
      const MAX_OTP_TTL = 3600; // 1 hour max
      const rawTtl = query.ttl ? Number.parseInt(query.ttl, 10) : undefined;
      const ttl =
        rawTtl && Number.isFinite(rawTtl) && rawTtl > 0 ? Math.min(rawTtl, MAX_OTP_TTL) : undefined;
      const result = otpManager.generate(ttl);
      return { code: result.code, expiresAt: result.expiresAt, ttlSeconds: result.ttlSeconds };
    },
    {
      query: t.Object({ ttl: t.Optional(t.String()) }),
      response: {
        200: t.Object({
          code: t.String(),
          expiresAt: t.Number(),
          ttlSeconds: t.Number()
        }),
        500: ErrorResponseSchema
      }
    }
  );
