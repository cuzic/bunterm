import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getFeaturePlugins } from '@/bootstrap/plugin-registry.js';
import { createServices, createSessionPluginsFactory } from '@/bootstrap/service-factory.js';
import { getCurrentConfig, initConfigManager } from '@/core/config/config-manager.js';
import { clearDaemonState, getStateDir, setDaemonState } from '@/core/config/state.js';
import type { Config } from '@/core/config/types.js';
import { InMemoryCookieSessionStore } from '@/core/server/auth/cookie-session.js';
import { createNativeTerminalServer, type NativeTerminalServer } from '@/core/server/server.js';
import { NativeSessionManager } from '@/core/server/session-manager.js';
import { createLogger, setLogFile } from '@/utils/logger.js';
import { captureException, initSentry } from '@/utils/sentry.js';
import { VERSION } from '@/version.js';

const log = createLogger('daemon');

export interface DaemonOptions {
  configPath?: string;
  foreground?: boolean;
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

  // Start native terminal daemon (Bun.serve based)
  await startNativeTerminalDaemon(config, configManager, options);
}

/**
 * Start daemon in native terminal mode (Bun.serve based)
 *
 * The HTTP API (served over both TCP and Unix socket by server.ts)
 * handles all CLI commands: ping, shutdown, reload.
 * No separate raw text Unix socket is needed.
 */
async function startNativeTerminalDaemon(
  config: Config,
  _configManager: ReturnType<typeof initConfigManager>,
  options: DaemonOptions
): Promise<void> {
  log.info('Starting native terminal daemon...');

  // Initialize auth session store if auth is enabled
  const cookieSessionStore = config.security?.auth_enabled
    ? new InMemoryCookieSessionStore()
    : null;
  if (cookieSessionStore) {
    log.info('Auth session store initialized');
  }

  // Bootstrap feature services, then create the server
  const sessionManager = new NativeSessionManager(config, createSessionPluginsFactory());
  const services = createServices(config, sessionManager);

  let nativeServer: NativeTerminalServer;
  try {
    nativeServer = createNativeTerminalServer({
      config,
      getConfig: getCurrentConfig,
      sessionManager,
      cookieSessionStore,
      featurePlugins: getFeaturePlugins(),
      ...services
    });
  } catch (error) {
    log.error(`Failed to start native terminal server: ${error}`);
    throw error;
  }

  // Save daemon state
  setDaemonState({
    pid: process.pid,
    port: config.daemon_port,
    socket_path: nativeServer.apiSocketPath,
    started_at: new Date().toISOString()
  });
  log.info(`Daemon state saved: pid=${process.pid}`);

  // Shutdown handler for native mode
  const shutdownNative = async () => {
    log.info('Shutdown requested (native mode)');
    await nativeServer.stop();
    clearDaemonState();
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
