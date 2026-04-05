/**
 * Native Terminal Server
 *
 * Elysia-based HTTP/WebSocket server for native terminal mode.
 * All routes, middleware, and WebSocket handlers are registered in the Elysia app.
 */

import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import type { AnyElysia } from 'elysia';
import { getApiSocketPath, getStateDir } from '@/core/config/state.js';
import type { Config } from '@/core/config/types.js';
import { OtpManager } from '@/core/server/auth/otp-manager.js';
import { createElysiaApp } from '@/core/server/elysia/app.js';
import { rateLimiterPlugin } from '@/core/server/elysia/middleware/rate-limiter.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import type { CommandExecutorManager } from '@/core/terminal/command-executor-manager.js';
import type { AgentTimelineService } from '@/features/agent-timeline/server/timeline-service.js';
import type { BlockEventEmitter } from '@/features/blocks/server/block-event-emitter.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('native-server');

export interface NativeTerminalServerOptions {
  config: Config;
  getConfig: () => Config;
  sessionManager: NativeSessionManager;
  cookieSessionStore?: import('@/core/server/auth/cookie-session.js').CookieSessionStore | null;
  shareManager?: import('@/features/share/server/share-manager.js').ShareManager | null;
  timelineService: AgentTimelineService;
  executorManager: CommandExecutorManager;
  blockEventEmitter: BlockEventEmitter;
  featurePlugins?: AnyElysia[];
  generateTimelineHtml?: ((basePath: string, nonce: string) => string) | null;
}

export interface NativeTerminalServer {
  sessionManager: NativeSessionManager;
  apiSocketPath: string;
  stop: () => Promise<void>;
}

/**
 * Create a native terminal server using Elysia
 */
export function createNativeTerminalServer(
  options: NativeTerminalServerOptions
): NativeTerminalServer {
  const { config, sessionManager, timelineService, executorManager, blockEventEmitter } = options;

  // Initialize OTP manager for browser authentication
  const otpManager = config.security?.auth_enabled ? new OtpManager() : null;

  // Create and start the Elysia app (rate limiter added here, not in createElysiaApp, to avoid affecting tests)
  const app = createElysiaApp({
    sessionManager,
    config,
    timelineService,
    executorManager,
    blockEventEmitter,
    cookieSessionStore: options.cookieSessionStore ?? null,
    shareManager: options.shareManager ?? null,
    otpManager,
    generateTimelineHtml: options.generateTimelineHtml ?? null,
    featurePlugins: options.featurePlugins
  }).use(rateLimiterPlugin);

  // Primary: TCP listener (for browsers + WebSocket)
  app.listen({
    port: config.daemon_port,
    hostname: config.listen_addresses[0] || '127.0.0.1'
  });

  log.info(`Native terminal server started on ${config.listen_addresses[0]}:${config.daemon_port}`);

  // Secondary: Unix socket listener (for CLI API, REST-only)
  const apiSocketPath = getApiSocketPath();
  if (existsSync(apiSocketPath)) {
    try {
      unlinkSync(apiSocketPath);
    } catch {
      // Ignore cleanup errors
    }
  }
  // Restrict state directory to owner only
  const stateDir = getStateDir();
  try {
    chmodSync(stateDir, 0o700);
  } catch {
    log.warn('Failed to set permissions on state directory');
  }

  const unixServer = Bun.serve({
    unix: apiSocketPath,
    fetch: app.fetch
  });

  // Restrict API socket to owner only (defense in depth)
  try {
    chmodSync(apiSocketPath, 0o600);
  } catch {
    log.warn('Failed to set permissions on API socket');
  }

  log.info(`Unix socket API listening: ${apiSocketPath}`);

  return {
    sessionManager,
    apiSocketPath,
    async stop() {
      timelineService.dispose();
      await sessionManager.stopAll();
      app.stop();
      unixServer.stop();
      if (existsSync(apiSocketPath)) {
        try {
          unlinkSync(apiSocketPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  };
}
