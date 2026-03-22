/**
 * Daemon Guard
 *
 * Daemon availability check for CLI commands.
 * Handles the not-running case with appropriate user feedback.
 */

import { isDaemonRunning } from '@/core/client/index.js';

export interface DaemonGuardOptions {
  /** Output JSON format when daemon not running */
  json?: boolean;
  /** Custom hint (default: 'Run "bunterm up" to start a session.') */
  hint?: string;
  /** Suppress console output */
  silent?: boolean;
}

export interface DaemonGuardResult {
  running: boolean;
}

/**
 * Check if daemon is running and handle the not-running case.
 *
 * Usage:
 * ```
 * const guard = await guardDaemon({ json: options.json });
 * if (!guard.running) return;
 * ```
 */
export async function guardDaemon(options: DaemonGuardOptions = {}): Promise<DaemonGuardResult> {
  if (await isDaemonRunning()) {
    return { running: true };
  }

  if (!options.silent) {
    if (options.json) {
      console.log(JSON.stringify({ daemon: false, sessions: [] }));
    } else {
      console.log('Daemon is not running.');
      console.log(options.hint ?? 'Run "bunterm up" to start a session.');
    }
  }

  return { running: false };
}
