import { spawnSync } from 'node:child_process';
import { getStatus, isDaemonRunning } from '@/core/client/index.js';
import { getFullPath, loadConfig } from '@/core/config/config.js';
import { handleCliError } from '@/utils/errors.js';

export interface StatusOptions {
  config?: string;
}

interface Pm2ProcessInfo {
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
function getPm2Status(): Pm2ProcessInfo | null {
  try {
    const result = spawnSync('pm2', ['jlist'], { stdio: 'pipe' });
    if (result.status !== 0) {
      return null;
    }

    const output = result.stdout?.toString() || '';
    const processes = JSON.parse(output) as Array<{
      name: string;
      pid: number;
      pm_id: number;
      pm2_env?: {
        status: string;
        restart_time: number;
        pm_uptime: number;
      };
      monit?: {
        memory: number;
        cpu: number;
      };
    }>;

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
function formatBytes(bytes: number): string {
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
function formatUptime(uptimeMs: number): string {
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

export async function statusCommand(options: StatusOptions): Promise<void> {
  const config = loadConfig(options.config);

  const running = await isDaemonRunning();

  // Show pm2 status if configured
  if (config.daemon_manager === 'pm2') {
    const pm2Status = getPm2Status();
    if (pm2Status) {
      console.log(
        `pm2: ${pm2Status.status} (pid: ${pm2Status.pid}, memory: ${formatBytes(pm2Status.memory)}, uptime: ${formatUptime(pm2Status.uptime)})`
      );
    } else {
      console.log('pm2: not running');
    }
  }

  if (!running) {
    console.log('Daemon is not running.');
    return;
  }

  try {
    const status = await getStatus(config);
    if (status.daemon) {
      console.log(`Daemon: running (port: ${config.daemon_port})`);
    }
    if (status.sessions.length === 0) {
      console.log('No active sessions.');
    } else {
      console.log(`Sessions (${status.sessions.length}):`);
      for (const session of status.sessions) {
        const fullPath = getFullPath(config, session.path);
        console.log(`  ${session.name}: http://localhost:${config.daemon_port}${fullPath}/`);
      }
    }
  } catch (error) {
    handleCliError('Failed to get status', error);
    process.exit(1);
  }
}
