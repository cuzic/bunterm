/**
 * Native Terminal WebSocket Protocol Types
 *
 * JSON-based protocol for communication between browser and server.
 * Unlike ttyd's binary protocol, this uses human-readable JSON for
 * easier debugging and extensibility.
 */

import type { ServerWebSocket } from 'bun';

// === Client → Server Messages ===

export interface InputMessage {
  type: 'input';
  data: string;
}

export interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = InputMessage | ResizeMessage | PingMessage;

// === Server → Client Messages ===

export interface OutputMessage {
  type: 'output';
  /** Base64 encoded binary data (supports non-UTF-8 sequences) */
  data: string;
}

export interface TitleMessage {
  type: 'title';
  title: string;
}

export interface ExitMessage {
  type: 'exit';
  code: number;
}

export interface PongMessage {
  type: 'pong';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | OutputMessage
  | TitleMessage
  | ExitMessage
  | PongMessage
  | ErrorMessage;

// === Session Types ===

export interface TerminalSessionOptions {
  /** Session name */
  name: string;
  /** Command to run (e.g., ['tmux', 'attach', '-t', 'session']) */
  command: string[];
  /** Working directory */
  cwd: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Initial terminal columns */
  cols?: number;
  /** Initial terminal rows */
  rows?: number;
  /** Output buffer size for AI features (number of messages to keep) */
  outputBufferSize?: number;
}

export interface TerminalSessionInfo {
  name: string;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  clientCount: number;
  startedAt: string;
}

// === WebSocket Handler Types ===

export interface NativeTerminalWebSocketData {
  sessionName: string;
}

export type NativeTerminalWebSocket = ServerWebSocket<NativeTerminalWebSocketData>;

// === Protocol Helpers ===

/**
 * Parse a client message from JSON string
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    switch (parsed.type) {
      case 'input':
        if (typeof parsed.data === 'string') {
          return { type: 'input', data: parsed.data };
        }
        break;
      case 'resize':
        if (
          typeof parsed.cols === 'number' &&
          typeof parsed.rows === 'number' &&
          parsed.cols > 0 &&
          parsed.rows > 0
        ) {
          return { type: 'resize', cols: parsed.cols, rows: parsed.rows };
        }
        break;
      case 'ping':
        return { type: 'ping' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serialize a server message to JSON string
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Create an output message from raw PTY data
 */
export function createOutputMessage(data: Buffer | Uint8Array): OutputMessage {
  const base64 = Buffer.from(data).toString('base64');
  return { type: 'output', data: base64 };
}

/**
 * Create an error message
 */
export function createErrorMessage(message: string): ErrorMessage {
  return { type: 'error', message };
}

/**
 * Create an exit message
 */
export function createExitMessage(code: number): ExitMessage {
  return { type: 'exit', code };
}

/**
 * Create a title message
 */
export function createTitleMessage(title: string): TitleMessage {
  return { type: 'title', title };
}

/**
 * Create a pong message
 */
export function createPongMessage(): PongMessage {
  return { type: 'pong' };
}
