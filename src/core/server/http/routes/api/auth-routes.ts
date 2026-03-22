/**
 * Auth API Routes
 *
 * Handles authentication: WebSocket token generation.
 */

import { z } from 'zod';
import { ok, err } from '@/utils/result.js';
import { sessionNotFound } from '@/core/errors.js';
import type { RouteDef } from '../../route-types.js';

// === Schemas ===

const WsTokenBodySchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  userId: z.string().optional()
});

type WsTokenBody = z.infer<typeof WsTokenBodySchema>;

// === Response Types ===

interface WsTokenResponse {
  token: string;
  sessionId: string;
  expiresIn: number;
}

// === Routes ===

export const authRoutes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/auth/ws-token',
    bodySchema: WsTokenBodySchema,
    description: 'Generate WebSocket authentication token',
    tags: ['auth'],
    handler: async (ctx) => {
      const { sessionId, userId } = ctx.body as WsTokenBody;

      if (!ctx.sessionManager.hasSession(sessionId)) {
        return err(sessionNotFound(sessionId));
      }

      const { getTokenGenerator } = await import('@/core/server/ws/session-token.js');
      const tokenGenerator = getTokenGenerator();
      const token = tokenGenerator.generate(sessionId, userId);

      return ok<WsTokenResponse>({
        token,
        sessionId,
        expiresIn: 30
      });
    }
  }
];

// === Legacy Handler (deprecated) ===

/**
 * @deprecated Use authRoutes with RouteRegistry instead
 */
export async function handleAuthRoutes(): Promise<Response | null> {
  // Preserved for backward compatibility during migration
  // Will be removed once API index uses RouteRegistry
  return null;
}
