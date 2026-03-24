/**
 * Shares API Routes (Elysia)
 *
 * Handles share link management: create, validate, revoke.
 * Replaces the old shares-routes.ts with Elysia's TypeBox validation.
 */

import { Elysia, t } from 'elysia';
import { coreContext } from './context.js';
import { ErrorResponseSchema } from './errors.js';

// === Response Schemas ===

const ShareStateSchema = t.Object({
  token: t.String(),
  sessionName: t.String(),
  createdAt: t.String(),
  expiresAt: t.String(),
  passwordHash: t.Optional(t.String())
});

const RevokeShareResponseSchema = t.Object({
  success: t.Boolean()
});

// === Plugin ===

export const sharesPlugin = new Elysia({ prefix: '/api' })
  .use(coreContext)

  // GET /api/shares - List all shares
  .get(
    '/shares',
    ({ shareManager }) => {
      if (!shareManager) {
        return [];
      }
      return shareManager.listShares();
    },
    { response: t.Array(ShareStateSchema) }
  )

  // POST /api/shares - Create a new share link
  .post(
    '/shares',
    ({ sessionManager, shareManager, body, error }) => {
      const { sessionName, expiresIn } = body;

      if (!sessionManager.hasSession(sessionName)) {
        return error(404, {
          error: 'SESSION_NOT_FOUND',
          message: `Session '${sessionName}' not found`
        });
      }

      if (!shareManager) {
        return error(500, {
          error: 'SHARE_MANAGER_NOT_INITIALIZED',
          message: 'Share manager is not initialized'
        });
      }

      const share = shareManager.createShare(sessionName, { expiresIn });
      return share;
    },
    {
      body: t.Object({
        sessionName: t.String({ minLength: 1 }),
        expiresIn: t.Optional(t.String({ default: '1h' }))
      }),
      response: {
        200: ShareStateSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema
      }
    }
  )

  // GET /api/shares/:token - Validate a share link
  .get(
    '/shares/:token',
    ({ shareManager, params, error }) => {
      const { token } = params;

      if (!shareManager) {
        return error(404, { error: 'NOT_FOUND', message: 'Share not found or expired' });
      }

      const share = shareManager.validateShare(token);

      if (!share) {
        return error(404, { error: 'NOT_FOUND', message: 'Share not found or expired' });
      }

      return share;
    },
    {
      params: t.Object({ token: t.String() }),
      response: {
        200: ShareStateSchema,
        404: ErrorResponseSchema
      }
    }
  )

  // DELETE /api/shares/:token - Revoke a share link
  .delete(
    '/shares/:token',
    ({ shareManager, params, error }) => {
      const { token } = params;

      if (!shareManager) {
        return error(404, { error: 'NOT_FOUND', message: 'Share not found' });
      }

      const success = shareManager.revokeShare(token);

      if (!success) {
        return error(404, { error: 'NOT_FOUND', message: 'Share not found' });
      }

      return { success: true };
    },
    {
      params: t.Object({ token: t.String() }),
      response: {
        200: RevokeShareResponseSchema,
        404: ErrorResponseSchema
      }
    }
  );
