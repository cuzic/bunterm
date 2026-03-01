/**
 * Preview WebSocket Handler
 *
 * Handles WebSocket connections for live preview file watching.
 * Uses dependency injection for testability.
 */

import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { createLogger } from '@/utils/logger.js';
import { WebSocketServer } from 'ws';
import { sessionManager as defaultSessionManager } from '../session-manager.js';
import type { SessionManagerDeps } from './deps.js';
import type { FileChangeEvent, PreviewClientMessage, PreviewServerMessage } from './types.js';
import { FileWatcherService } from './watcher.js';

const log = createLogger('preview-ws');

/** WebSocket-like interface for testing */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: { toString(): string }) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** WebSocket server-like interface for testing */
export interface WebSocketServerLike {
  clients: Set<WebSocketLike>;
  handleUpgrade(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    callback: (ws: WebSocketLike) => void
  ): void;
  emit(event: string, ...args: unknown[]): void;
}

/** Dependencies for PreviewWsHandler */
export interface PreviewWsHandlerDeps {
  sessionManager: SessionManagerDeps;
  fileWatcher: FileWatcherService<WebSocketLike>;
  createWsServer?: () => WebSocketServerLike;
}

/** Default dependencies */
const defaultDeps: PreviewWsHandlerDeps = {
  sessionManager: defaultSessionManager,
  fileWatcher: new FileWatcherService()
};

/**
 * Preview WebSocket Handler
 *
 * Manages WebSocket connections for live preview file watching.
 */
export class PreviewWsHandler {
  private deps: PreviewWsHandlerDeps;
  private wss: WebSocketServerLike;
  private clientSessions = new Map<WebSocketLike, string>();
  private changeListenerInitialized = false;

  constructor(deps: Partial<PreviewWsHandlerDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };

    // Create WebSocket server
    if (deps.createWsServer) {
      this.wss = deps.createWsServer();
    } else {
      this.wss = new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike;
    }
  }

  /**
   * Initialize change event forwarding
   */
  private initializeChangeListener(): void {
    if (this.changeListenerInitialized) {
      return;
    }
    this.changeListenerInitialized = true;

    this.deps.fileWatcher.onFileChange((event: FileChangeEvent) => {
      this.broadcastChange(event);
    });
  }

  /**
   * Broadcast a file change event to all connected clients
   */
  private broadcastChange(event: FileChangeEvent): void {
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        const message: PreviewServerMessage = event;
        client.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Handle a WebSocket message from client
   */
  handleMessage(ws: WebSocketLike, data: string): void {
    try {
      const message = JSON.parse(data) as PreviewClientMessage;

      // Find session directory
      const session = this.deps.sessionManager
        .listSessions()
        .find((s) => s.name === message.session);
      if (!session) {
        log.warn(`Session not found: ${message.session}`);
        return;
      }

      switch (message.action) {
        case 'watch': {
          this.clientSessions.set(ws, message.session);
          const success = this.deps.fileWatcher.watchFile(
            session.dir,
            message.path,
            message.session,
            ws
          );
          if (success) {
            log.debug(`Client subscribed to: ${message.session}/${message.path}`);
          }
          break;
        }

        case 'unwatch': {
          this.deps.fileWatcher.unwatchFile(session.dir, message.path, ws);
          log.debug(`Client unsubscribed from: ${message.session}/${message.path}`);
          break;
        }

        case 'watchDir': {
          this.clientSessions.set(ws, message.session);
          const success = this.deps.fileWatcher.watchDirectory(
            session.dir,
            message.path,
            message.session,
            ws
          );
          if (success) {
            log.debug(`Client watching directory: ${message.session}/${message.path}`);
          }
          break;
        }

        case 'unwatchDir': {
          this.deps.fileWatcher.unwatchDirectory(session.dir, message.path, ws);
          log.debug(`Client unwatched directory: ${message.session}/${message.path}`);
          break;
        }

        default:
          log.warn(`Unknown action: ${(message as { action: string }).action}`);
      }
    } catch (err) {
      log.error('Failed to parse message:', err);
    }
  }

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws: WebSocketLike): void {
    log.debug('Preview WebSocket client connected');

    ws.on('message', (data) => {
      this.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      log.debug('Preview WebSocket client disconnected');
      this.deps.fileWatcher.unwatchAllForClient(ws);
      this.clientSessions.delete(ws);
    });

    ws.on('error', (err) => {
      log.error('WebSocket error:', err);
      this.deps.fileWatcher.unwatchAllForClient(ws);
      this.clientSessions.delete(ws);
    });
  }

  /**
   * Handle WebSocket upgrade for preview endpoint
   */
  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    this.initializeChangeListener();

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
      this.handleConnection(ws);
    });
  }

  /**
   * Get preview WebSocket statistics
   */
  getStats(): { connectedClients: number } {
    return {
      connectedClients: this.wss.clients.size
    };
  }

  /**
   * Cleanup preview WebSocket server
   */
  cleanup(): void {
    for (const client of this.wss.clients) {
      client.close(1000, 'Server shutdown');
    }
    this.clientSessions.clear();
    log.info('Preview WebSocket server cleaned up');
  }
}

// =============================================================================
// Module-level singleton for backward compatibility
// =============================================================================

let defaultHandler: PreviewWsHandler | null = null;

function getDefaultHandler(): PreviewWsHandler {
  if (!defaultHandler) {
    defaultHandler = new PreviewWsHandler();
  }
  return defaultHandler;
}

/** Handle WebSocket upgrade for preview endpoint (backward compatible) */
export function handlePreviewUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  getDefaultHandler().handleUpgrade(req, socket, head);
}

/** Get preview WebSocket statistics (backward compatible) */
export function getPreviewWsStats(): { connectedClients: number } {
  return getDefaultHandler().getStats();
}

/** Cleanup preview WebSocket server (backward compatible) */
export function cleanupPreviewWs(): void {
  if (defaultHandler) {
    defaultHandler.cleanup();
    defaultHandler = null;
  }
}

/** Reset default handler (for testing) */
export function resetDefaultHandler(): void {
  if (defaultHandler) {
    defaultHandler.cleanup();
    defaultHandler = null;
  }
}
