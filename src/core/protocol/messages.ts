/**
 * Core WebSocket Protocol Messages
 *
 * JSON-based protocol for communication between browser and server.
 * Unlike legacy binary protocol, this uses human-readable JSON for
 * easier debugging and extensibility.
 */

import type { ServerWebSocket } from 'bun';

// === Client → Server Messages ===

export interface InputMessage {
  type: 'input';
  /** Base64 encoded input data (supports mouse escape sequences with binary data) */
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

// === File Watcher Messages (Client → Server) ===

export interface WatchFileMessage {
  type: 'watchFile';
  /** File path relative to session directory */
  path: string;
}

export interface UnwatchFileMessage {
  type: 'unwatchFile';
  path: string;
}

export interface WatchDirMessage {
  type: 'watchDir';
  /** Directory path relative to session directory (recursive) */
  path: string;
}

export interface UnwatchDirMessage {
  type: 'unwatchDir';
  path: string;
}

export interface ReplayRequestMessage {
  type: 'replayRequest';
}

export type ClientMessage =
  | InputMessage
  | ResizeMessage
  | PingMessage
  | WatchFileMessage
  | UnwatchFileMessage
  | WatchDirMessage
  | UnwatchDirMessage
  | ReplayRequestMessage;

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

export interface BellMessage {
  type: 'bell';
}

export interface FileChangeMessage {
  type: 'fileChange';
  /** File path relative to session directory */
  path: string;
  /** Timestamp when change was detected */
  timestamp: number;
}

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
