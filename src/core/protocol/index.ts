/**
 * Core Protocol Module
 *
 * Re-exports all protocol types and helpers for WebSocket communication.
 */

// === Messages ===
export type {
  // Client messages
  InputMessage,
  ResizeMessage,
  PingMessage,
  WatchFileMessage,
  UnwatchFileMessage,
  WatchDirMessage,
  UnwatchDirMessage,
  ClientMessage,
  // Server messages
  OutputMessage,
  TitleMessage,
  ExitMessage,
  PongMessage,
  ErrorMessage,
  BellMessage,
  FileChangeMessage,
  // Session types
  TerminalSessionOptions,
  TerminalSessionInfo,
  // WebSocket types
  NativeTerminalWebSocketData,
  NativeTerminalWebSocket
} from './messages.js';

// === Blocks ===
export {
  type BlockStatus,
  type ExtendedBlockStatus,
  type ExecutionMode,
  type SubmissionSource,
  type BlockErrorType,
  type GitInfo,
  type AgentMeta,
  type Block,
  type ExtendedBlock,
  type OutputChunk,
  type CommandRequest,
  type CommandResponse,
  type IntegrationStatus,
  type RetentionPolicy,
  DEFAULT_RETENTION_POLICY,
  type CancelRequest,
  type CancelResponse,
  type ChunkQueryParams,
  type ChunkQueryResponse,
  type BlockEventType,
  type BlockEvent,
  type BlockSession,
  type BlockStartMessage,
  type BlockEndMessage,
  type BlockOutputMessage,
  type BlockListMessage
} from './blocks.js';

// === AI ===
export type {
  AICitation,
  AINextCommand,
  AIStreamMessage,
  AIFinalMessage,
  AIErrorMessage,
  AIRunStartedMessage,
  AIMessage
} from './ai.js';

// === Helpers ===
export {
  parseClientMessage,
  parseClientMessageSafe,
  parseServerMessage,
  parseServerMessageSafe,
  serializeServerMessage,
  createOutputMessage,
  createErrorMessage,
  createExitMessage,
  createTitleMessage,
  createPongMessage,
  createBellMessage,
  createFileChangeMessage,
  createBlockStartMessage,
  createBlockEndMessage,
  createBlockOutputMessage,
  createBlockListMessage
} from './helpers.js';

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
