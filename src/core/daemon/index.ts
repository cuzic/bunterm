import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer as createUnixServer } from 'node:net';
import { join } from 'node:path';
import { getCurrentConfig, initConfigManager, reloadConfig } from '@/core/config/config-manager.js';
import {
  clearDaemonState,
  getSocketPath,
  getStateDir,
  setDaemonState
} from '@/core/config/state.js';
import type { Config } from '@/core/config/types.js';
import { InMemoryCookieSessionStore } from '@/core/server/auth/cookie-session.js';
import { setAuthSessionRouteDeps } from '@/core/server/http/routes/api/auth-session-routes.js';
import { createNativeTerminalServer, type NativeTerminalServer } from '@/core/server/server.js';
import { createLogger, setLogFile } from '@/utils/logger.js';
import { captureException, initSentry } from '@/utils/sentry.js';
import { VERSION } from '@/version.js';

const log = createLogger('daemon');

export interface DaemonOptions {
  configPath?: string;
  foreground?: boolean;
}

/**
 * Clean up a socket file if it exists
 */
function cleanupSocketFile(socketPath: string, label = 'socket'): void {
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
      log.info(`Removed old ${label}: ${socketPath}`);
    } catch (err) {
      log.warn(`Failed to remove old ${label} ${socketPath}: ${err}`);
    }
  }
}

export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
  log.info('Starting daemon...');

  const configManager = initConfigManager(options.configPath);
  const config = configManager.getConfig();
  log.info(`Config loaded: port=${config.daemon_port}, base_path=${config.base_path}`);

  // Initialize Sentry early (before setting up error handlers)
  await initSentry(config.sentry, VERSION);

  // Set up global error handlers (with Sentry integration)
  process.on('uncaughtException', (error) => {
    log.error(`Uncaught exception: ${error.message}`, error.stack);
    captureException(error, { type: 'uncaughtException' });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
    captureException(reason, { type: 'unhandledRejection' });
    // Note: We don't exit here - unhandled rejections should be logged but not crash the daemon
  });

  // Handle SIGUSR1 for debug info
  process.on('SIGUSR1', () => {
    log.info('Received SIGUSR1 - daemon is alive');
  });

  const stateDir = getStateDir();
  const socketPath = getSocketPath();

  // Ensure state directory exists
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
    log.info(`Created state directory: ${stateDir}`);
  }

  // Enable file logging for crash debugging (unless already set via env)
  if (!process.env['BUNTERM_LOG_FILE']) {
    const logPath = join(stateDir, 'daemon.log');
    setLogFile(logPath);
    log.info(`Log file enabled: ${logPath}`);
  }

  // Clean up old sockets
  cleanupSocketFile(socketPath, 'CLI socket');

  // Start native terminal daemon (Bun.serve based)
  await startNativeTerminalDaemon(config, configManager, socketPath, options);
}

/**
 * Start daemon in native terminal mode (Bun.serve based)
 */
async function startNativeTerminalDaemon(
  config: Config,
  _configManager: ReturnType<typeof initConfigManager>,
  socketPath: string,
  options: DaemonOptions
): Promise<void> {
  log.info('Starting native terminal daemon...');

  // Create native terminal server
  let nativeServer: NativeTerminalServer;
  try {
    nativeServer = createNativeTerminalServer({
      config,
      getConfig: getCurrentConfig
    });
  } catch (error) {
    log.error(`Failed to start native terminal server: ${error}`);
    throw error;
  }

  // Initialize auth session route deps if auth is enabled
  if (config.security?.auth_enabled) {
    const cookieSessionStore = new InMemoryCookieSessionStore();
    setAuthSessionRouteDeps({ cookieSessionStore });
    log.info('Auth session route deps initialized');
  }

  // Save daemon state
  setDaemonState({
    pid: process.pid,
    port: config.daemon_port,
    started_at: new Date().toISOString()
  });
  log.info(`Daemon state saved: pid=${process.pid}`);

  // Create Unix socket for CLI communication
  const unixServer = createUnixServer((socket) => {
    socket.on('data', (data) => {
      const command = data.toString().trim();
      log.debug(`Unix socket received command: ${command}`);
      if (command === 'ping') {
        socket.write('pong');
      } else if (
        command === 'shutdown' ||
        command === 'shutdown-with-sessions' ||
        command === 'shutdown-with-sessions-kill-tmux'
      ) {
        socket.write('ok');
        shutdownNative();
      } else if (command === 'reload') {
        const result = reloadConfig();
        socket.write(JSON.stringify(result));
      }
      socket.end();
    });
    socket.on('error', (err) => {
      log.error(`Unix socket connection error: ${err.message}`);
    });
  });

  unixServer.on('error', (err) => {
    log.error(`Unix server error: ${err.message}`, err.stack);
  });

  unixServer.listen(socketPath, () => {
    log.info(`Unix socket listening: ${socketPath}`);
  });

  // Shutdown handler for native mode
  const shutdownNative = async () => {
    log.info('Shutdown requested (native mode)');
    await nativeServer.stop();
    clearDaemonState();
    unixServer.close();
    cleanupSocketFile(socketPath, 'CLI socket');
    log.info('Native daemon shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    log.info('Received SIGINT');
    shutdownNative();
  });
  process.on('SIGTERM', () => {
    log.info('Received SIGTERM');
    shutdownNative();
  });

  // Keep process running
  if (!options.foreground) {
    process.stdin.unref?.();
  }
}

// Note: Auto-execution removed because compiled Bun binaries always match
// process.argv[1] === __filename. Use 'bunterm daemon -f' instead.
