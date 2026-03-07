/**
 * Share command - Generate read-only share links
 */

import { ensureDaemon } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { addShare, getAllShares, getSession, removeShare } from '@/core/config/state.js';
import { createShareManager } from '@/features/share/server/share-manager.js';

export interface ShareOptions {
  expires?: string;
  readonly?: boolean;
}

export interface ShareListOptions {
  json?: boolean;
}

export type ShareRevokeOptions = Record<string, never>;

// Create a ShareManager with file-system backed store
function getShareManager() {
  return createShareManager({
    getShares: getAllShares,
    addShare: addShare,
    removeShare: removeShare,
    getShare: (token: string) => getAllShares().find((s) => s.token === token)
  });
}

/**
 * Create a share link for a session
 */
export async function shareCommand(sessionName: string, options: ShareOptions): Promise<void> {
  const config = loadConfig();

  // Ensure daemon is running
  await ensureDaemon(undefined, config.daemon_manager);

  // Check if session exists
  const session = getSession(sessionName);
  if (!session) {
    process.exit(1);
  }

  const manager = getShareManager();
  const share = manager.createShare(sessionName, {
    expiresIn: options.expires ?? '1h'
  });

  // Generate URL
  const hostname = config.hostname ?? `localhost:${config.daemon_port}`;
  const protocol = config.hostname ? 'https' : 'http';
  const _url = `${protocol}://${hostname}${config.base_path}/share/${share.token}`;
}

/**
 * List all active shares
 */
export function shareListCommand(options: ShareListOptions): void {
  const manager = getShareManager();
  const shares = manager.listShares();

  if (shares.length === 0) {
    return;
  }

  if (options.json) {
    return;
  }

  for (const share of shares) {
    const expiresAt = new Date(share.expiresAt);
    const _remaining = formatRemaining(expiresAt);
  }
}

/**
 * Revoke a share
 */
export function shareRevokeCommand(token: string, _options: ShareRevokeOptions): void {
  const manager = getShareManager();
  const success = manager.revokeShare(token);

  if (success) {
  } else {
    process.exit(1);
  }
}

/**
 * Format remaining time until expiration
 */
function formatRemaining(expiresAt: Date): string {
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
