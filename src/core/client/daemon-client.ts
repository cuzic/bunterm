/**
 * Daemon Client
 *
 * High-level facade for daemon lifecycle management.
 * Coordinates probe, spawner, and waiter modules.
 */

import type { DaemonManager } from '@/core/config/types.js';
import {
  getDaemonClientDeps,
  resetDaemonClientDeps,
  setDaemonClientDeps
} from './daemon-client-deps.js';
import { isDaemonRunning, sendCommand } from './daemon-probe.js';
import {
  isPm2Available,
  isPm2Managing,
  restartPm2Process,
  spawnDirectDaemon,
  startWithPm2
} from './daemon-spawner.js';
import {
  DAEMON_START_TIMEOUT,
  DAEMON_STOP_TIMEOUT,
  waitForDaemon,
  waitForDaemonStop
} from './daemon-waiter.js';

// Re-export probe functions
export { isDaemonRunning, resetDaemonClientDeps, sendCommand, setDaemonClientDeps };

/**
 * Ensure daemon is running, starting it if necessary
 */
export async function ensureDaemon(
  configPath?: string,
  daemonManager?: DaemonManager
): Promise<void> {
  if (await isDaemonRunning()) {
    return;
  }

  // Use pm2 if configured
  if (daemonManager === 'pm2') {
    if (!(await isPm2Available())) {
      throw new Error(
        'pm2 is not installed. Install with: npm install -g pm2\n' +
          'Or change daemon_manager to "direct" in config.yaml'
      );
    }

    // Check if already managed by pm2 (might be stopped)
    if (await isPm2Managing()) {
      // Restart the pm2 process
      restartPm2Process();
    } else {
      // Start fresh with pm2
      if (!(await startWithPm2(configPath))) {
        throw new Error('Failed to start daemon with pm2. Check pm2 logs: pm2 logs bunterm');
      }
    }

    if (!(await waitForDaemon())) {
      throw new Error(
        `Failed to start daemon via pm2: timeout after ${DAEMON_START_TIMEOUT / 1000} seconds.\nCheck pm2 logs: pm2 logs bunterm`
      );
    }
    return;
  }

  // Direct mode (default)
  spawnDirectDaemon(configPath);

  if (!(await waitForDaemon())) {
    throw new Error(
      `Failed to start daemon: timeout after ${DAEMON_START_TIMEOUT / 1000} seconds.\n  Possible causes:\n    - Required commands not installed\n    - Port ${process.env['BUNTERM_DAEMON_PORT'] || 7680} already in use\n    - Permission issues with socket path\n  Run 'bunterm doctor' to diagnose the problem.\n  Or start manually: bunterm start -f`
    );
  }
}

export interface ShutdownDaemonOptions {
  /** Stop all sessions before shutting down the daemon */
  stopSessions?: boolean;
  /** Kill tmux sessions when stopping (requires stopSessions) */
  killTmux?: boolean;
}

/**
 * Shutdown daemon via HTTP API over Unix socket
 */
export async function shutdownDaemon(options: ShutdownDaemonOptions = {}): Promise<void> {
  const deps = getDaemonClientDeps();
  const socketPath = deps.stateStore.getApiSocketPath();

  if (!(await deps.socketClient.exists(socketPath))) {
    return;
  }

  try {
    await fetch('http://localhost/api/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stopSessions: options.stopSessions ?? false,
        killTmux: options.killTmux ?? false
      }),
      unix: socketPath,
      signal: AbortSignal.timeout(5000)
    } as RequestInit);
  } catch {
    // Server may shut down before responding — that's expected
  }
}

export interface RestartDaemonOptions {
  /** Config file path */
  configPath?: string;
}

/**
 * Restart daemon (stop and start)
 */
export async function restartDaemon(options: RestartDaemonOptions = {}): Promise<void> {
  const wasRunning = await isDaemonRunning();

  if (wasRunning) {
    await shutdownDaemon();

    if (!(await waitForDaemonStop())) {
      throw new Error(
        `Failed to stop daemon: timeout after ${DAEMON_STOP_TIMEOUT / 1000} seconds.`
      );
    }
  }

  await ensureDaemon(options.configPath);
}
