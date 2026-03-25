/**
 * System API Routes (Elysia)
 *
 * Health check (ping) and daemon lifecycle endpoints.
 * Replaces the old raw text Unix socket commands.
 */

import { Elysia, t } from 'elysia';
import { reloadConfig } from '@/core/config/config-manager.js';

const ShutdownBodySchema = t.Optional(
  t.Object({
    stopSessions: t.Optional(t.Boolean())
  })
);

const ReloadResponseSchema = t.Object({
  success: t.Boolean(),
  reloaded: t.Array(t.String()),
  requiresRestart: t.Array(t.String()),
  error: t.Optional(t.String())
});

export const systemPlugin = new Elysia({ prefix: '/api' })
  // GET /api/ping — health check (replaces raw socket "ping" → "pong")
  .get('/ping', () => ({ status: 'ok' as const }), {
    response: t.Object({ status: t.Literal('ok') })
  })

  // POST /api/shutdown — graceful daemon shutdown
  .post(
    '/shutdown',
    ({ body }) => {
      // Schedule shutdown after response is sent
      setTimeout(() => {
        process.emit('SIGTERM', 'SIGTERM');
      }, 100);
      return {
        status: 'shutting_down' as const,
        stopSessions: body?.stopSessions ?? false
      };
    },
    {
      body: ShutdownBodySchema,
      response: t.Object({
        status: t.Literal('shutting_down'),
        stopSessions: t.Boolean()
      })
    }
  )

  // POST /api/reload — reload daemon configuration
  .post(
    '/reload',
    () => {
      return reloadConfig();
    },
    {
      response: ReloadResponseSchema
    }
  );
