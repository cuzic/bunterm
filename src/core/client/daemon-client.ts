import { isAbsolute, resolve } from 'node:path';
import { ensurePm2Config } from '@/core/config/pm2-config.js';
import { type StateStore, defaultStateStore } from '@/core/config/state-store.js';
import type { DaemonManager } from '@/core/config/types.js';
import { type ProcessRunner, defaultProcessRunner } from '@/utils/process-runner.js';
import { type SocketClient, defaultSocketClient } from '@/utils/socket-client.js';

const DAEMON_START_TIMEOUT = 5000;
const DAEMON_STOP_TIMEOUT = 5000;
const DAEMON_CHECK_INTERVAL = 100;

/**
 * Dependencies for DaemonClient (for testing)
 */
export interface DaemonClientDeps {
  stateStore: StateStore;
  socketClient: SocketClient;
  processRunner: ProcessRunner;
}

/**
 * Default dependencies using real implementations
 */
export const defaultDaemonClientDeps: DaemonClientDeps = {
  stateStore: defaultStateStore,
  socketClient: defaultSocketClient,
  processRunner: defaultProcessRunner
};

// Module-level deps (allows dependency injection for testing)
let currentDeps: DaemonClientDeps = defaultDaemonClientDeps;

/**
 * Set dependencies (for testing)
 */
export function setDaemonClientDeps(deps: Partial<DaemonClientDeps>): void {
  currentDeps = { ...defaultDaemonClientDeps, ...deps };
}

/**
 * Reset dependencies to defaults
 */
export function resetDaemonClientDeps(): void {
  currentDeps = defaultDaemonClientDeps;
}

/**
 * Get current dependencies (for api-client)
 */
export function getDaemonClientDeps(): DaemonClientDeps {
  return currentDeps;
}

/**
 * Check if daemon is running by pinging the socket
 */
export async function isDaemonRunning(): Promise<boolean> {
  const socketPath = currentDeps.stateStore.getSocketPath();

  if (!currentDeps.socketClient.exists(socketPath)) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = currentDeps.socketClient.connect(socketPath);

    socket.on('connect', () => {
      socket.write('ping');
    });

    socket.on('data', (data) => {
      const response = data.toString().trim();
      socket.end();
      resolve(response === 'pong');
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

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
function detectRunMode(): 'bun-run' | 'script' | 'binary' {
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
function buildDaemonCommand(configPath?: string): DaemonCommand {
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
 * Wait for daemon to become ready
 * Uses setInterval to keep the event loop alive during the wait
 */
async function waitForDaemon(): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = async () => {
      if (Date.now() - startTime >= DAEMON_START_TIMEOUT) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }

      const running = await isDaemonRunning();
      if (running) {
        clearInterval(intervalId);
        resolve(true);
      }
    };

    // Use setInterval to keep the event loop alive
    const intervalId = setInterval(check, DAEMON_CHECK_INTERVAL);
    // Run the first check immediately
    check();
  });
}

/**
 * Check if pm2 is available
 */
async function isPm2Available(): Promise<boolean> {
  try {
    const result = currentDeps.processRunner.spawnSync('pm2', ['--version'], {
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
async function isPm2Managing(): Promise<boolean> {
  try {
    const result = currentDeps.processRunner.spawnSync('pm2', ['jlist'], {
      stdio: 'pipe'
    });
    if (result.status !== 0) {
      return false;
    }
    const output = result.stdout?.toString() || '';
    const processes = JSON.parse(output);
    return processes.some((p: { name: string }) => p.name === 'bunterm');
  } catch {
    return false;
  }
}

/**
 * Start daemon via pm2
 */
async function startWithPm2(configPath?: string): Promise<boolean> {
  // Ensure pm2 config exists in ~/.config/bunterm/
  const ecosystemPath = ensurePm2Config({ configPath });

  try {
    const result = currentDeps.processRunner.spawnSync('pm2', ['start', ecosystemPath], {
      stdio: 'pipe'
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

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
      currentDeps.processRunner.spawnSync('pm2', ['restart', 'bunterm'], { stdio: 'pipe' });
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
  const { executable, args } = buildDaemonCommand(configPath);

  const child = currentDeps.processRunner.spawn(executable, args, {
    detached: true,
    stdio: 'ignore',
    env: process.env
  });

  child.unref();

  if (!(await waitForDaemon())) {
    throw new Error(
      `Failed to start daemon: timeout after ${DAEMON_START_TIMEOUT / 1000} seconds.\n  Possible causes:\n    - Required commands (ttyd, tmux) not installed\n    - Port ${process.env['BUNTERM_DAEMON_PORT'] || 7680} already in use\n    - Permission issues with socket path\n  Run 'bunterm doctor' to diagnose the problem.\n  Or start manually: bunterm start -f`
    );
  }
}

/**
 * Send a command to the daemon and get response
 */
export async function sendCommand(command: string): Promise<string | null> {
  const socketPath = currentDeps.stateStore.getSocketPath();

  if (!currentDeps.socketClient.exists(socketPath)) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const socket = currentDeps.socketClient.connect(socketPath);

    socket.on('connect', () => {
      socket.write(command);
    });

    socket.on('data', (data) => {
      const response = data.toString().trim();
      socket.end();
      resolve(response);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('Command timeout'));
    });
  });
}

export interface ShutdownDaemonOptions {
  /** Stop all sessions before shutting down the daemon */
  stopSessions?: boolean;
  /** Kill tmux sessions when stopping (requires stopSessions) */
  killTmux?: boolean;
}

/**
 * Shutdown daemon via socket command
 */
export async function shutdownDaemon(options: ShutdownDaemonOptions = {}): Promise<void> {
  const socketPath = currentDeps.stateStore.getSocketPath();

  if (!currentDeps.socketClient.exists(socketPath)) {
    return;
  }

  let command: string;
  if (options.stopSessions && options.killTmux) {
    command = 'shutdown-with-sessions-kill-tmux';
  } else if (options.stopSessions) {
    command = 'shutdown-with-sessions';
  } else {
    command = 'shutdown';
  }

  return new Promise((resolve, reject) => {
    const socket = currentDeps.socketClient.connect(socketPath);

    socket.on('connect', () => {
      socket.write(command);
    });

    socket.on('data', (data) => {
      const response = data.toString().trim();
      socket.end();
      if (response === 'ok') {
        resolve();
      } else {
        reject(new Error('Unexpected response'));
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Wait for daemon to stop
 * Uses setInterval to keep the event loop alive during the wait
 */
async function waitForDaemonStop(): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = async () => {
      if (Date.now() - startTime >= DAEMON_STOP_TIMEOUT) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }

      const running = await isDaemonRunning();
      if (!running) {
        clearInterval(intervalId);
        resolve(true);
      }
    };

    // Use setInterval to keep the event loop alive
    const intervalId = setInterval(check, DAEMON_CHECK_INTERVAL);
    // Run the first check immediately
    check();
  });
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
