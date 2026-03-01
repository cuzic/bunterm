/**
 * Share management API routes
 *
 * Handles: /api/shares
 */

import { addShare, getAllShares, getShare, removeShare } from '@/config/state.js';
import { getErrorMessage } from '@/utils/errors.js';
import { MAX_JSON_BODY_SIZE, readBodyWithLimit, sendJson } from '../http-utils.js';
import { sessionManager } from '../session-manager.js';
import { createShareManager } from '../share-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

/** Regex to match share API endpoints */
const SHARE_TOKEN_REGEX = /^\/api\/shares\/(.+)$/;

// Create ShareManager with file-system backed store
const shareManager = createShareManager({
  getShares: getAllShares,
  addShare: addShare,
  removeShare: removeShare,
  getShare: (token: string) => getShare(token)
});

/**
 * Share routes handler
 */
export const handleShareRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { req, res, path, method } = ctx;

  // GET /api/shares - List all shares
  if (path === '/api/shares' && method === 'GET') {
    const shares = shareManager.listShares();
    sendJson(res, 200, shares);
    return true;
  }

  // POST /api/shares - Create a share
  if (path === '/api/shares' && method === 'POST') {
    readBodyWithLimit(req, MAX_JSON_BODY_SIZE)
      .then((body) => {
        const parsed = JSON.parse(body) as {
          sessionName: string;
          expiresIn?: string;
        };

        // Check if session exists
        const session = sessionManager.findByName(parsed.sessionName);
        if (!session) {
          sendJson(res, 404, { error: `Session "${parsed.sessionName}" not found` });
          return;
        }

        const share = shareManager.createShare(parsed.sessionName, {
          expiresIn: parsed.expiresIn ?? '1h'
        });
        sendJson(res, 201, share);
      })
      .catch((error) => {
        sendJson(res, 400, { error: getErrorMessage(error) });
      });
    return true;
  }

  // GET /api/shares/:token - Validate a share
  const shareGetMatch = path.match(SHARE_TOKEN_REGEX);
  if (shareGetMatch?.[1] && method === 'GET') {
    const token = decodeURIComponent(shareGetMatch[1]);
    const share = shareManager.validateShare(token);
    if (share) {
      sendJson(res, 200, share);
    } else {
      sendJson(res, 404, { error: 'Share not found or expired' });
    }
    return true;
  }

  // DELETE /api/shares/:token - Revoke a share
  const shareDeleteMatch = path.match(SHARE_TOKEN_REGEX);
  if (shareDeleteMatch?.[1] && method === 'DELETE') {
    const token = decodeURIComponent(shareDeleteMatch[1]);
    const success = shareManager.revokeShare(token);
    if (success) {
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 404, { error: 'Share not found' });
    }
    return true;
  }

  return false;
};
