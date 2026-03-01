import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer as createUnixServer } from 'node:net';
import {
  addPushSubscription,
  clearDaemonState,
  getAllPushSubscriptions,
  getSocketPath,
  getStateDir,
  removePushSubscription,
  setDaemonState
} from '@/config/state.js';
import { createLogger } from '@/utils/logger.js';
import { captureException, initSentry } from '@/utils/sentry.js';
import { VERSION } from '@/version.js';
import { getCurrentConfig, initConfigManager, reloadConfig } from './config-manager.js';
import { createNotificationService } from './notification/index.js';
import { createDaemonServer, setConfigGetter } from './server.js';
import { sessionManager } from './session-manager.js';
import { setNotificationService } from './ws-proxy.js';

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

/**
 * Clean up multiple socket files
 */
function cleanupSocketFiles(socketPaths: string[], label = 'socket'): void {
  for (const socketPath of socketPaths) {
    cleanupSocketFile(socketPath, label);
  }
}

/**
 * Revalidate existing sessions from previous daemon instance
 */
function revalidateExistingSessions(): void {
  const { valid, removed } = sessionManager.revalidateSessions();
  if (valid.length === 0 && removed.length === 0) {
    return;
  }
  log.info(`Session revalidation: ${valid.length} active, ${removed.length} removed`);
  if (valid.length > 0) {
    console.log(`Recovered ${valid.length} existing session(s)`);
  }
  if (removed.length > 0) {
    console.log(`Cleaned up ${removed.length} dead session(s)`);
  }
}

export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
  log.info('Starting daemon...');

  revalidateExistingSessions();

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
  });

  // Set up config getter for hot-reload support
  setConfigGetter(getCurrentConfig);

  // Initialize notification service if configured
  const stateDir = getStateDir();
  if (config.notifications.enabled !== false) {
    try {
      const notificationService = createNotificationService(config.notifications, stateDir, {
        getSubscriptions: getAllPushSubscriptions,
        addSubscription: addPushSubscription,
        removeSubscription: removePushSubscription
      });
      setNotificationService(notificationService);
      log.info('Notification service initialized');
      if (config.notifications.patterns.length > 0) {
        log.info(`Watching ${config.notifications.patterns.length} pattern(s) for notifications`);
      }
    } catch (error) {
      log.error(`Failed to initialize notification service: ${String(error)}`);
    }
  }

  const socketPath = getSocketPath();

  // Ensure state directory exists
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
    log.info(`Created state directory: ${stateDir}`);
  }

  // Clean up old sockets
  cleanupSocketFile(socketPath, 'CLI socket');

  // Create HTTP servers for each listen address
  const listenAddresses = config.listen_addresses;
  const listenSockets = config.listen_sockets;
  const httpServers = listenAddresses.map(() => createDaemonServer(config));

  // Create HTTP servers for Unix sockets
  const socketServers = listenSockets.map(() => createDaemonServer(config));

  // Clean up old HTTP socket files
  cleanupSocketFiles(listenSockets, 'HTTP socket');

  // Start HTTP servers on TCP
  let firstServer = true;
  for (let i = 0; i < listenAddresses.length; i++) {
    const address = listenAddresses[i];
    const server = httpServers[i];
    if (!(address && server)) {
      continue;
    }

    server.on('error', (err) => {
      log.error(`HTTP server error on ${address}: ${err.message}`, err.stack);
    });

    server.listen(config.daemon_port, address, () => {
      log.info(`HTTP server listening on ${address}:${config.daemon_port}`);
      if (firstServer) {
        firstServer = false;
        console.log(
          `ttyd-mux daemon started on http://localhost:${config.daemon_port}${config.base_path}/`
        );
        console.log(`  Listening on: ${listenAddresses.join(', ')}`);
        if (listenSockets.length > 0) {
          console.log(`  Unix sockets: ${listenSockets.join(', ')}`);
        }

        // Save daemon state
        setDaemonState({
          pid: process.pid,
          port: config.daemon_port,
          started_at: new Date().toISOString()
        });
        log.info(`Daemon state saved: pid=${process.pid}`);
      }
    });
  }

  // Start HTTP servers on Unix sockets
  for (let i = 0; i < listenSockets.length; i++) {
    const sockPath = listenSockets[i];
    const server = socketServers[i];
    if (!(sockPath && server)) {
      continue;
    }

    server.on('error', (err) => {
      log.error(`HTTP socket server error on ${sockPath}: ${err.message}`, err.stack);
    });

    server.listen(sockPath, () => {
      log.info(`HTTP server listening on unix:${sockPath}`);
    });
  }

  // Create Unix socket for CLI communication
  const unixServer = createUnixServer((socket) => {
    socket.on('data', (data) => {
      const command = data.toString().trim();
      log.debug(`Unix socket received command: ${command}`);
      if (command === 'ping') {
        socket.write('pong');
      } else if (command === 'shutdown') {
        socket.write('ok');
        shutdown({ stopSessions: false });
      } else if (command === 'shutdown-with-sessions') {
        socket.write('ok');
        shutdown({ stopSessions: true });
      } else if (command === 'shutdown-with-sessions-kill-tmux') {
        socket.write('ok');
        shutdown({ stopSessions: true, killTmux: true });
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
    console.log(`Unix socket: ${socketPath}`);
  });

  // Handle shutdown signals
  interface ShutdownOptions {
    stopSessions?: boolean;
    killTmux?: boolean;
  }
  const shutdown = (options: ShutdownOptions = {}) => {
    const { stopSessions = false, killTmux = false } = options;
    log.info(`Shutdown requested (stopSessions=${stopSessions}, killTmux=${killTmux})`);
    console.log('\nShutting down...');
    if (stopSessions) {
      sessionManager.stopAllSessions({ killTmux });
      log.info('All sessions stopped');
    } else {
      log.info('Sessions preserved (daemon-only shutdown)');
    }
    clearDaemonState();
    log.info('Daemon state cleared');

    for (const server of httpServers) {
      server.close();
    }
    for (const server of socketServers) {
      server.close();
    }
    unixServer.close();
    log.info('Servers closed');

    // Clean up socket files
    cleanupSocketFile(socketPath, 'CLI socket');
    cleanupSocketFiles(listenSockets, 'HTTP socket');

    log.info('Daemon shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    log.info('Received SIGINT');
    shutdown();
  });
  process.on('SIGTERM', () => {
    log.info('Received SIGTERM');
    shutdown();
  });

  // Keep process running
  if (!options.foreground) {
    // When not in foreground, detach stdio
    process.stdin.unref?.();
  }
}

// Note: Auto-execution removed because compiled Bun binaries always match
// process.argv[1] === __filename. Use 'ttyd-mux daemon -f' instead.
