/**
 * Native Terminal WebSocket Handler
 *
 * Handles WebSocket connections for native terminal sessions using Bun's
 * built-in WebSocket server.
 */

import type { ServerWebSocket } from 'bun';
import type { NativeSessionManager } from './session-manager.js';
import type { NativeTerminalWebSocket, NativeTerminalWebSocketData } from './types.js';
import { serializeServerMessage, createErrorMessage } from './types.js';

export interface NativeTerminalWebSocketHandlerOptions {
  /** Session manager instance */
  sessionManager: NativeSessionManager;
  /** Base path for WebSocket endpoints (e.g., /ttyd-mux) */
  basePath: string;
}

/**
 * Create WebSocket handlers for native terminal connections
 */
// Using 'any' for Server type due to Bun's generic requirements
// biome-ignore lint/suspicious/noExplicitAny: Bun Server type varies by context
type BunServer = any;

export function createNativeTerminalWebSocketHandlers(
  options: NativeTerminalWebSocketHandlerOptions
): {
  upgrade: (req: Request, server: BunServer) => Response | undefined;
  websocket: {
    open: (ws: ServerWebSocket<NativeTerminalWebSocketData>) => void;
    message: (ws: ServerWebSocket<NativeTerminalWebSocketData>, message: string | Buffer) => void;
    close: (ws: ServerWebSocket<NativeTerminalWebSocketData>) => void;
  };
} {
  const { sessionManager, basePath } = options;

  /**
   * Extract session name from WebSocket path
   * e.g., /ttyd-mux/my-session/ws -> my-session
   */
  function extractSessionName(pathname: string): string | null {
    const prefix = basePath + '/';
    if (!pathname.startsWith(prefix)) {
      return null;
    }

    const rest = pathname.slice(prefix.length);
    if (!rest.endsWith('/ws')) {
      return null;
    }

    return rest.slice(0, -3); // Remove '/ws'
  }

  return {
    /**
     * Upgrade HTTP request to WebSocket for native terminal
     */
    upgrade(req: Request, server: BunServer): Response | undefined {
      const url = new URL(req.url);
      const sessionName = extractSessionName(url.pathname);

      if (!sessionName) {
        return undefined; // Not a native terminal WebSocket request
      }

      // Check if session exists
      const session = sessionManager.getSession(sessionName);
      if (!session) {
        return new Response('Session not found', { status: 404 });
      }

      // Upgrade to WebSocket
      const upgraded = server.upgrade(req, {
        data: { sessionName },
      });

      if (upgraded) {
        return undefined; // Upgrade successful
      }

      return new Response('WebSocket upgrade failed', { status: 500 });
    },

    websocket: {
      /**
       * Handle WebSocket connection opened
       */
      open(ws: NativeTerminalWebSocket): void {
        const { sessionName } = ws.data;
        const session = sessionManager.getSession(sessionName);

        if (!session) {
          ws.send(serializeServerMessage(createErrorMessage('Session not found')));
          ws.close(1008, 'Session not found');
          return;
        }

        session.addClient(ws);
        console.log(`[NativeTerminalWS] Client connected to session: ${sessionName}`);
      },

      /**
       * Handle incoming WebSocket message
       */
      message(ws: NativeTerminalWebSocket, message: string | Buffer): void {
        const { sessionName } = ws.data;
        const session = sessionManager.getSession(sessionName);

        if (!session) {
          ws.send(serializeServerMessage(createErrorMessage('Session not found')));
          return;
        }

        // Convert Buffer to string if needed
        const messageStr = typeof message === 'string' ? message : message.toString('utf-8');

        session.handleMessage(ws, messageStr);
      },

      /**
       * Handle WebSocket connection closed
       */
      close(ws: NativeTerminalWebSocket): void {
        const { sessionName } = ws.data;
        sessionManager.handleWebSocketClose(sessionName, ws);
        console.log(`[NativeTerminalWS] Client disconnected from session: ${sessionName}`);
      },
    },
  };
}

/**
 * Check if a request path matches a native terminal WebSocket endpoint
 */
export function isNativeTerminalWebSocketPath(pathname: string, basePath: string): boolean {
  const prefix = basePath + '/';
  if (!pathname.startsWith(prefix)) {
    return false;
  }

  const rest = pathname.slice(prefix.length);
  return rest.endsWith('/ws');
}

/**
 * Check if a request path matches a native terminal HTML endpoint
 */
export function isNativeTerminalHtmlPath(pathname: string, basePath: string): boolean {
  const prefix = basePath + '/';
  if (!pathname.startsWith(prefix)) {
    return false;
  }

  const rest = pathname.slice(prefix.length);
  // Match /ttyd-mux/session-name/ or /ttyd-mux/session-name
  // But not /ttyd-mux/session-name/ws or /ttyd-mux/static-file.js
  if (rest.endsWith('/ws')) {
    return false;
  }
  if (rest.includes('.')) {
    // Has file extension, likely a static file
    return false;
  }

  // Should be a session name (possibly with trailing slash)
  const sessionName = rest.replace(/\/$/, '');
  return sessionName.length > 0 && !sessionName.includes('/');
}
