/**
 * ClientBroadcaster - Manages WebSocket clients and message broadcasting
 *
 * This class handles:
 * - Adding/removing WebSocket client connections
 * - Broadcasting messages to all connected clients
 * - Replaying buffered output to reconnecting clients
 */

import type { Block, NativeTerminalWebSocket, ServerMessage } from './types.js';
import { createBlockListMessage, serializeServerMessage } from './types.js';

export interface BroadcasterOptions {
  /** Maximum number of output lines to buffer for replay (default: 1000) */
  maxOutputBuffer?: number;
  /** Maximum number of output lines to replay on reconnect (default: 100) */
  replayCount?: number;
}

const DEFAULT_MAX_OUTPUT_BUFFER = 1000;
const DEFAULT_REPLAY_COUNT = 100;

/**
 * Manages WebSocket client connections and message broadcasting
 */
export class ClientBroadcaster {
  private readonly clients: Set<NativeTerminalWebSocket> = new Set();
  private readonly outputBuffer: string[] = [];
  private readonly maxOutputBuffer: number;
  private readonly replayCount: number;

  constructor(options: BroadcasterOptions = {}) {
    this.maxOutputBuffer = options.maxOutputBuffer ?? DEFAULT_MAX_OUTPUT_BUFFER;
    this.replayCount = options.replayCount ?? DEFAULT_REPLAY_COUNT;
  }

  /**
   * Add a new client connection
   */
  addClient(ws: NativeTerminalWebSocket): void {
    this.clients.add(ws);
  }

  /**
   * Remove a client connection
   */
  removeClient(ws: NativeTerminalWebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: ServerMessage): void {
    const serialized = serializeServerMessage(message);
    for (const ws of this.clients) {
      try {
        ws.send(serialized);
      } catch {
        // Client disconnected - will be cleaned up later
      }
    }
  }

  /**
   * Broadcast raw serialized data to all connected clients
   */
  broadcastRaw(serialized: string): void {
    for (const ws of this.clients) {
      try {
        ws.send(serialized);
      } catch {
        // Client disconnected
      }
    }
  }

  /**
   * Buffer output for replay on client reconnection
   */
  bufferOutput(data: string): void {
    this.outputBuffer.push(data);
    if (this.outputBuffer.length > this.maxOutputBuffer) {
      this.outputBuffer.shift();
    }
  }

  /**
   * Replay buffered output to a specific client
   */
  replayTo(ws: NativeTerminalWebSocket): void {
    if (this.outputBuffer.length === 0) return;

    const count = Math.min(this.outputBuffer.length, this.replayCount);
    const replay = this.outputBuffer.slice(-count);

    for (const data of replay) {
      try {
        ws.send(serializeServerMessage({ type: 'output', data }));
      } catch {
        break; // Client disconnected
      }
    }
  }

  /**
   * Send block list to a specific client (for reconnection)
   */
  sendBlockList(ws: NativeTerminalWebSocket, blocks: Block[]): void {
    if (blocks.length === 0) return;

    try {
      ws.send(serializeServerMessage(createBlockListMessage(blocks)));
    } catch {
      // Client disconnected
    }
  }

  /**
   * Get buffered output (for AI features)
   */
  getOutputBuffer(): string[] {
    return [...this.outputBuffer];
  }

  /**
   * Clear the output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer.length = 0;
  }

  /**
   * Close all client connections
   */
  closeAll(code = 1000, reason = 'Session ended'): void {
    for (const ws of this.clients) {
      try {
        ws.close(code, reason);
      } catch {
        // Already closed
      }
    }
    this.clients.clear();
  }
}
