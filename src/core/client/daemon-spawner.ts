/**
 * Daemon Spawner
 *
 * Handles daemon process spawning with direct and pm2 modes.
 */

import { isAbsolute, resolve } from 'node:path';
import { ensurePm2Config } from '@/core/config/pm2-config.js';
import { getDaemonClientDeps } from './daemon-client-deps.js';
import { parsePm2ProcessList } from './schemas.js';

interface DaemonCommand {
  executable: string;
  args: string[];
}

/**
 * Resolve script path to absolute path
 */
function resolveScriptPath(scriptPath: string | undefined): string {
  if (!scriptPath) {
    return '';
  }
  return isAbsolute(scriptPath) ? scriptPath : resolve(scriptPath);
}

/**
 * Detect how the script is being run
 */
export function detectRunMode(): 'bun-run' | 'script' | 'binary' {
  const arg1 = process.argv[1];
  if (arg1 === 'run') {
    return 'bun-run';
  }
  if (arg1?.endsWith('.ts') || arg1?.endsWith('.js')) {
    return 'script';
  }
  if (arg1 && arg1 !== process.execPath) {
    return 'script'; // symlink
  }
  return 'binary';
}

/**
 * Build the command to spawn daemon based on how this script is being run
 */
export function buildDaemonCommand(configPath?: string): DaemonCommand {
  const mode = detectRunMode();
  let executable: string;
  let args: string[];

  switch (mode) {
    case 'bun-run': {
      executable = process.argv[0] ?? 'bun';
      args = ['run', resolveScriptPath(process.argv[2]), 'start', '-f'];
      break;
    }
    case 'script': {
      executable = process.argv[0] ?? 'bun';
      args = [resolveScriptPath(process.argv[1]), 'start', '-f'];
      break;
    }
    default: {
      executable = process.execPath;
      args = ['start', '-f'];
    }
  }

  if (configPath) {
    args.push('-c', configPath);
  }

  return { executable, args };
}

/**
 * Check if pm2 is available
 */
export async function isPm2Available(): Promise<boolean> {
  const deps = getDaemonClientDeps();
  try {
    const result = deps.processRunner.spawnSync('pm2', ['--version'], {
      stdio: 'pipe'
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if bunterm is managed by pm2
 */
export async function isPm2Managing(): Promise<boolean> {
  const deps = getDaemonClientDeps();
  try {
    const result = deps.processRunner.spawnSync('pm2', ['jlist'], {
      stdio: 'pipe'
    });
    if (result.status !== 0) {
      return false;
    }
    const output = result.stdout?.toString() || '';
    const processes = parsePm2ProcessList(output);
    return processes.some((p) => p.name === 'bunterm');
  } catch {
    return false;
  }
}

/**
 * Start daemon via pm2
 */
export async function startWithPm2(configPath?: string): Promise<boolean> {
  const deps = getDaemonClientDeps();
  // Ensure pm2 config exists in ~/.config/bunterm/
  const ecosystemPath = ensurePm2Config({ configPath });

  try {
    const result = deps.processRunner.spawnSync('pm2', ['start', ecosystemPath], {
      stdio: 'pipe'
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Restart pm2-managed bunterm process
 */
export function restartPm2Process(): void {
  const deps = getDaemonClientDeps();
  deps.processRunner.spawnSync('pm2', ['restart', 'bunterm'], { stdio: 'pipe' });
}

/**
 * Spawn daemon in direct mode (detached process)
 */
export function spawnDirectDaemon(configPath?: string): void {
  const deps = getDaemonClientDeps();
  const { executable, args } = buildDaemonCommand(configPath);

  const child = deps.processRunner.spawn(executable, args, {
    detached: true,
    stdio: 'ignore',
    env: process.env
  });

  child.unref();
}
