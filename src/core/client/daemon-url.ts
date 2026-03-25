/**
 * Daemon URL / Connection Resolution
 *
 * Resolves the daemon connection from state or config.
 * Prefers Unix socket when available, falls back to TCP.
 */

// biome-ignore lint: existsSync is intentional — getDaemonConnection must be sync
import { existsSync } from 'node:fs';
import type { Config } from '@/core/config/types.js';
import { getDaemonClientDeps } from './daemon-client-deps.js';

/**
 * Connection info for reaching the daemon.
 * When `unix` is set, the client should use Unix socket transport.
 */
export interface DaemonConnection {
  baseUrl: string;
  unix?: string;
}

/**
 * Get daemon connection preferring Unix socket over TCP.
 */
export function getDaemonConnection(config: Config): DaemonConnection {
  const deps = getDaemonClientDeps();
  const daemon = deps.stateStore.getDaemonState();
  const socketPath = daemon?.socket_path ?? deps.stateStore.getApiSocketPath();

  if (socketPath && existsSync(socketPath)) {
    return { baseUrl: 'http://localhost', unix: socketPath };
  }

  const port = daemon?.port ?? config.daemon_port;
  return { baseUrl: `http://localhost:${port}` };
}
