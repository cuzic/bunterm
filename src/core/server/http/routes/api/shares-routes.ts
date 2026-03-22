/**
 * Shares API Routes
 *
 * Handles share link management: create, validate, revoke.
 */

import type { ApiContext } from './types.js';
import { jsonResponse, errorResponse } from '../../utils.js';
import { shareManager } from '../page-routes.js';

/**
 * Handle shares API routes
 */
export async function handleSharesRoutes(ctx: ApiContext): Promise<Response | null> {
  const { apiPath, method, req, sessionManager, sentryEnabled } = ctx;

  // GET /api/shares - List all shares
  if (apiPath === '/shares' && method === 'GET') {
    const shares = shareManager.listShares();
    return jsonResponse(shares, { sentryEnabled });
  }

  // POST /api/shares - Create a share
  if (apiPath === '/shares' && method === 'POST') {
    try {
      const body = (await req.json()) as { sessionName: string; expiresIn?: string };

      if (!sessionManager.hasSession(body.sessionName)) {
        return errorResponse(`Session "${body.sessionName}" not found`, 404, sentryEnabled);
      }

      const share = shareManager.createShare(body.sessionName, {
        expiresIn: body.expiresIn ?? '1h'
      });
      return jsonResponse(share, { status: 201, sentryEnabled });
    } catch (error) {
      return errorResponse(String(error), 400, sentryEnabled);
    }
  }

  // GET /api/shares/:token - Validate a share
  if (apiPath.startsWith('/shares/') && method === 'GET') {
    const token = decodeURIComponent(apiPath.slice('/shares/'.length));
    const share = shareManager.validateShare(token);
    if (share) {
      return jsonResponse(share, { sentryEnabled });
    }
    return errorResponse('Share not found or expired', 404, sentryEnabled);
  }

  // DELETE /api/shares/:token - Revoke a share
  if (apiPath.startsWith('/shares/') && method === 'DELETE') {
    const token = decodeURIComponent(apiPath.slice('/shares/'.length));
    const success = shareManager.revokeShare(token);
    if (success) {
      return jsonResponse({ success: true }, { sentryEnabled });
    }
    return errorResponse('Share not found', 404, sentryEnabled);
  }

  return null;
}
