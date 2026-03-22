/**
 * Share Service
 *
 * Business logic for session sharing.
 */

import { addShare, getAllShares, getSession, removeShare } from '@/core/config/state.js';
import type { Config } from '@/core/config/types.js';
import { buildShareUrl } from '@/core/cli/helpers/url-builder.js';
import { createShareManager, type ShareState } from '@/features/share/server/share-manager.js';
import { type Result, err, ok } from '@/utils/result.js';

/**
 * Get a configured ShareManager
 */
function getShareManager() {
  return createShareManager({
    getShares: getAllShares,
    addShare: addShare,
    removeShare: removeShare,
    getShare: (token: string) => getAllShares().find((s) => s.token === token)
  });
}

/**
 * Create share result
 */
export interface CreateShareResult {
  share: ShareState;
  url: string;
}

/**
 * Create a share link for a session
 */
export function createShare(
  sessionName: string,
  config: Config,
  expiresIn: string
): Result<CreateShareResult, string> {
  // Check if session exists
  const session = getSession(sessionName);
  if (!session) {
    return err(`Session '${sessionName}' not found`);
  }

  const manager = getShareManager();
  const share = manager.createShare(sessionName, { expiresIn });
  const url = buildShareUrl(config, share.token);

  return ok({ share, url });
}

/**
 * List all active shares
 */
export function listShares(): ShareState[] {
  const manager = getShareManager();
  return manager.listShares();
}

/**
 * Revoke a share
 */
export function revokeShare(token: string): boolean {
  const manager = getShareManager();
  return manager.revokeShare(token);
}

/**
 * Format remaining time until expiration
 */
export function formatRemaining(expiresAt: Date): string {
  const now = Date.now();
  const remaining = expiresAt.getTime() - now;

  if (remaining <= 0) {
    return 'expired';
  }

  const minutes = Math.floor(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m remaining`;
  }
  return `${minutes}m remaining`;
}
