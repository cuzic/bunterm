/**
 * Native Terminal Server
 *
 * Bun.serve based HTTP/WebSocket server for native terminal mode.
 * This server handles both HTTP requests and WebSocket connections
 * for native terminal sessions.
 */

import { normalizeBasePath } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';
import { NativeSessionManager } from '@/core/server/session-manager.js';
import {
  type AuthenticatedWebSocketData,
  createNativeTerminalWebSocketHandlers,
  isNativeTerminalWebSocketPath
} from '@/core/server/ws-handler.js';
import { createLogger } from '@/utils/logger.js';
import type { Server as BunServer, ServerWebSocket } from 'bun';

const log = createLogger('native-server');

/**
 * Extract session name from WebSocket path
 * e.g., /bunterm/my-session/ws -> my-session
 */
function extractSessionNameFromWsPath(pathname: string, basePath: string): string | null {
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rest = pathname.slice(prefix.length);
  if (!rest.endsWith('/ws')) {
    return null;
  }

  return rest.slice(0, -3); // Remove '/ws'
}

export interface NativeTerminalServerOptions {
  config: Config;
  getConfig: () => Config;
}

export interface NativeTerminalServer {
  server: BunServer<AuthenticatedWebSocketData>;
  sessionManager: NativeSessionManager;
  stop: () => Promise<void>;
}

/**
 * Create a native terminal server using Bun.serve
 */
export function createNativeTerminalServer(
  options: NativeTerminalServerOptions
): NativeTerminalServer {
  const { config, getConfig } = options;
  const sessionManager = new NativeSessionManager(config);
  const basePath = normalizeBasePath(config.base_path);

  const wsHandlers = createNativeTerminalWebSocketHandlers({
    sessionManager,
    basePath
  });

  const server = Bun.serve<AuthenticatedWebSocketData>({
    port: config.daemon_port,
    hostname: config.listen_addresses[0] || '127.0.0.1',

    async fetch(req, server) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const currentConfig = getConfig();

      log.debug(`Request: ${req.method} ${pathname}`);

      // Handle WebSocket upgrade for native terminal sessions
      if (isNativeTerminalWebSocketPath(pathname, basePath)) {
        // Extract session name from path
        const sessionName = extractSessionNameFromWsPath(pathname, basePath);
        if (!sessionName) {
          return new Response('Invalid WebSocket path', { status: 400 });
        }

        // Create session if it doesn't exist
        if (!sessionManager.hasSession(sessionName)) {
          try {
            await sessionManager.createSession({
              name: sessionName,
              dir: process.cwd(),
              path: `${basePath}/${sessionName}`
            });
            log.info(`Created session on WebSocket connect: ${sessionName}`);
          } catch (error) {
            log.error(`Failed to create session ${sessionName}: ${error}`);
            return new Response('Failed to create session', { status: 500 });
          }
        }

        // Upgrade to WebSocket
        const upgraded = server.upgrade(req, {
          data: { sessionName, authenticated: false }
        });

        if (upgraded) {
          return undefined; // Upgrade successful
        }

        return new Response('WebSocket upgrade failed', { status: 500 });
      }

      // Import router functions dynamically to avoid circular dependency
      const { handleHttpRequest } = await import('@/core/server/http-handler.js');
      return handleHttpRequest(req, currentConfig, sessionManager, basePath);
    },

    websocket: {
      open(ws: ServerWebSocket<AuthenticatedWebSocketData>) {
        wsHandlers.websocket.open(ws);
      },
      message(ws: ServerWebSocket<AuthenticatedWebSocketData>, message: string | Buffer) {
        wsHandlers.websocket.message(ws, message);
      },
      close(ws: ServerWebSocket<AuthenticatedWebSocketData>) {
        wsHandlers.websocket.close(ws);
      }
    }
  });

  log.info(`Native terminal server started on ${config.listen_addresses[0]}:${config.daemon_port}`);

  return {
    server,
    sessionManager,
    async stop() {
      await sessionManager.stopAll();
      server.stop();
    }
  };
}
