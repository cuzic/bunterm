/**
 * Auth Session API Routes (Elysia)
 *
 * Endpoints for listing and revoking authenticated cookie sessions.
 * Replaces the old auth-session-routes.ts with Elysia's TypeBox validation.
 */

import { Elysia, t } from 'elysia';
import { coreContext } from './context.js';
import { ErrorResponseSchema } from './errors.js';

// === Helpers ===

/** Truncate session ID to short prefix for display (security: never expose full ID) */
function shortId(id: string): string {
  return id.slice(0, 8);
}

// === Response Schemas ===

const AuthSessionResponseSchema = t.Object({
  id: t.String(),
  remoteAddr: t.String(),
  createdAt: t.String(),
  expiresAt: t.String()
});

const RevokeResponseSchema = t.Object({
  revoked: t.Boolean(),
  id: t.String()
});

// === Plugin ===

export const authSessionsPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/auth/sessions - List active authenticated sessions
  .get(
    '/auth/sessions',
    ({ cookieSessionStore }) => {
      if (!cookieSessionStore) {
        return [];
      }

      const sessions = cookieSessionStore.listSessions();
      return sessions.map((s) => ({
        id: shortId(s.id),
        remoteAddr: s.remoteAddr,
        createdAt: new Date(s.createdAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString()
      }));
    },
    { response: t.Array(AuthSessionResponseSchema) }
  )

  // DELETE /api/auth/sessions/:id - Revoke an authenticated session
  .delete(
    '/auth/sessions/:id',
    ({ cookieSessionStore, params, error }) => {
      const shortSessionId = params.id;

      if (!cookieSessionStore) {
        return error(404, { error: 'NOT_FOUND', message: `Session '${shortSessionId}' not found` });
      }

      // Find the full session ID matching the short prefix
      const sessions = cookieSessionStore.listSessions();
      const target = sessions.find((s) => s.id.startsWith(shortSessionId));

      if (!target) {
        return error(404, { error: 'NOT_FOUND', message: `Session '${shortSessionId}' not found` });
      }

      cookieSessionStore.revoke(target.id);
      return { revoked: true, id: shortSessionId };
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: RevokeResponseSchema,
        404: ErrorResponseSchema
      }
    }
  );
