/**
 * Share command - Generate read-only share links
 */

import { ensureDaemon } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import {
  createShare,
  formatRemaining,
  listShares,
  revokeShare
} from '@/core/cli/services/share-service.js';
import { CliError } from '@/utils/errors.js';

export interface ShareOptions {
  expires?: string;
  readonly?: boolean;
}

export interface ShareListOptions {
  json?: boolean;
}

export type ShareRevokeOptions = Record<string, never>;

/**
 * Create a share link for a session
 */
export async function shareCommand(sessionName: string, options: ShareOptions): Promise<void> {
  const config = loadConfig();

  // Ensure daemon is running
  await ensureDaemon(undefined, config.daemon_manager);

  const result = createShare(sessionName, config, options.expires ?? '1h');

  if ('error' in result) {
    throw new CliError(result.error);
  }

  console.log(`Share created for session '${sessionName}':`);
  console.log(result.url);
}

/**
 * List all active shares
 */
export function shareListCommand(options: ShareListOptions): void {
  const shares = listShares();

  if (shares.length === 0) {
    console.log('No active shares.');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(shares, null, 2));
    return;
  }

  console.log('Active shares:');
  for (const share of shares) {
    const expiresAt = new Date(share.expiresAt);
    const remaining = formatRemaining(expiresAt);
    console.log(`  ${share.token}: ${share.sessionName} (expires in ${remaining})`);
  }
}

/**
 * Revoke a share
 */
export function shareRevokeCommand(token: string, _options: ShareRevokeOptions): void {
  const success = revokeShare(token);

  if (!success) {
    throw new CliError(`Share '${token}' not found`);
  }

  console.log(`Share '${token}' revoked`);
}
