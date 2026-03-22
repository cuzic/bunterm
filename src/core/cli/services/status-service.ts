/**
 * Status Service
 *
 * Provides status information for daemon, sessions, and pm2.
 */

import { spawnSync } from 'node:child_process';
import { parsePm2ProcessList } from '@/core/client/schemas.js';

/**
 * PM2 process information
 */
export interface Pm2ProcessInfo {
  name: string;
  pid: number;
  pm_id: number;
  status: string;
  memory: number;
  cpu: number;
  uptime: number;
  restarts: number;
}

/**
 * Get pm2 status for bunterm process
 */
export function getPm2Status(): Pm2ProcessInfo | null {
  try {
    const result = spawnSync('pm2', ['jlist'], { stdio: 'pipe' });
    if (result.status !== 0) {
      return null;
    }

    const output = result.stdout?.toString() || '';
    const processes = parsePm2ProcessList(output);

    const bunterm = processes.find((p) => p.name === 'bunterm');
    if (!bunterm) {
      return null;
    }

    return {
      name: bunterm.name,
      pid: bunterm.pid,
      pm_id: bunterm.pm_id,
      status: bunterm.pm2_env?.status ?? 'unknown',
      memory: bunterm.monit?.memory ?? 0,
      cpu: bunterm.monit?.cpu ?? 0,
      uptime: bunterm.pm2_env?.pm_uptime ?? 0,
      restarts: bunterm.pm2_env?.restart_time ?? 0
    };
  } catch {
    return null;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format uptime to human readable string
 */
export function formatUptime(uptimeMs: number): string {
  const now = Date.now();
  const elapsed = now - uptimeMs;

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format PM2 status as a single line
 */
export function formatPm2StatusLine(info: Pm2ProcessInfo): string {
  return `pm2: ${info.status} (pid: ${info.pid}, memory: ${formatBytes(info.memory)}, uptime: ${formatUptime(info.uptime)})`;
}
