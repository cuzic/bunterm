/**
 * Core Protocol Module
 *
 * Re-exports all protocol types and helpers for WebSocket communication.
 */

// === AI ===
export type {
  AICitation,
  AIErrorMessage,
  AIFinalMessage,
  AIMessage,
  AINextCommand,
  AIRunStartedMessage,
  AIStreamMessage
} from './ai.js';

// === Blocks ===
export {
  type AgentMeta,
  type Block,
  type BlockEndMessage,
  type BlockErrorType,
  type BlockEvent,
  type BlockEventType,
  type BlockListMessage,
  type BlockOutputMessage,
  type BlockSession,
  type BlockStartMessage,
  type BlockStatus,
  type CancelRequest,
  type CancelResponse,
  type ChunkQueryParams,
  type ChunkQueryResponse,
  type CommandRequest,
  type CommandResponse,
  DEFAULT_RETENTION_POLICY,
  type ExecutionMode,
  type ExtendedBlock,
  type ExtendedBlockStatus,
  type GitInfo,
  type IntegrationStatus,
  type OutputChunk,
  type RetentionPolicy,
  type SubmissionSource
} from './blocks.js';
// === Helpers ===
export {
  createBellMessage,
  createBlockEndMessage,
  createBlockListMessage,
  createBlockOutputMessage,
  createBlockStartMessage,
  createErrorMessage,
  createExitMessage,
  createFileChangeMessage,
  createOutputMessage,
  createPongMessage,
  createTitleMessage,
  parseClientMessage,
  parseClientMessageSafe,
  parseServerMessage,
  parseServerMessageSafe,
  serializeServerMessage
} from './helpers.js';
// === Messages ===
export type {
  BellMessage,
  ClientMessage,
  ErrorMessage,
  ExitMessage,
  FileChangeMessage,
  // Client messages
  InputMessage,
  NativeTerminalWebSocket,
  // WebSocket types
  NativeTerminalWebSocketData,
  // Server messages
  OutputMessage,
  PingMessage,
  PongMessage,
  ResizeMessage,
  TerminalSessionInfo,
  // Session types
  TerminalSessionOptions,
  TitleMessage,
  UnwatchDirMessage,
  UnwatchFileMessage,
  WatchDirMessage,
  WatchFileMessage
} from './messages.js';

// === Schemas ===
export {
  ClientMessageSchema,
  ServerMessageSchema,
  type ValidatedClientMessage,
  type ValidatedServerMessage
} from './schemas.js';

import type { AIErrorMessage, AIFinalMessage, AIRunStartedMessage, AIStreamMessage } from './ai.js';
import type {
  BlockEndMessage,
  BlockListMessage,
  BlockOutputMessage,
  BlockStartMessage
} from './blocks.js';
// === Import for ServerMessage union ===
import type {
  BellMessage,
  ErrorMessage,
  ExitMessage,
  FileChangeMessage,
  OutputMessage,
  PongMessage,
  TitleMessage
} from './messages.js';

// Re-export Claude Watcher types
export type {
  ClaudeAssistantTextWS,
  ClaudeSessionStartWS,
  ClaudeThinkingWS,
  ClaudeToolResultWS,
  ClaudeToolUseWS,
  ClaudeUserMessageWS,
  ClaudeWatcherMessage
} from '@/features/claude-watcher/server/types.js';

import type { ClaudeWatcherMessage } from '@/features/claude-watcher/server/types.js';

/** All server message types */
export type ServerMessage =
  | OutputMessage
  | TitleMessage
  | ExitMessage
  | PongMessage
  | ErrorMessage
  | BellMessage
  | FileChangeMessage
  | BlockStartMessage
  | BlockEndMessage
  | BlockOutputMessage
  | BlockListMessage
  | AIStreamMessage
  | AIFinalMessage
  | AIErrorMessage
  | AIRunStartedMessage
  | ClaudeWatcherMessage;
