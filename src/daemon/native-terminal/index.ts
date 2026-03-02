/**
 * Native Terminal Module
 *
 * Provides Bun.Terminal-based PTY management as an alternative to ttyd.
 * This enables direct PTY control for AI features and reduces external dependencies.
 */

export { TerminalSession } from './terminal-session.js';
export { NativeSessionManager } from './session-manager.js';
export type { NativeSessionOptions, NativeSessionState } from './session-manager.js';
export { generateNativeTerminalHtml } from './html-template.js';
export type { NativeTerminalHtmlOptions } from './html-template.js';
export {
  createNativeTerminalWebSocketHandlers,
  isNativeTerminalWebSocketPath,
  isNativeTerminalHtmlPath
} from './ws-handler.js';
export type { NativeTerminalWebSocketHandlerOptions } from './ws-handler.js';

export type {
  Block,
  BlockEndMessage,
  BlockListMessage,
  BlockOutputMessage,
  BlockSession,
  BlockStartMessage,
  BlockStatus,
  ClientMessage,
  ErrorMessage,
  ExitMessage,
  InputMessage,
  NativeTerminalWebSocket,
  NativeTerminalWebSocketData,
  OutputMessage,
  PingMessage,
  PongMessage,
  ResizeMessage,
  ServerMessage,
  TerminalSessionInfo,
  TerminalSessionOptions,
  TitleMessage
} from './types.js';

export {
  createBlockEndMessage,
  createBlockListMessage,
  createBlockOutputMessage,
  createBlockStartMessage,
  createErrorMessage,
  createExitMessage,
  createOutputMessage,
  createPongMessage,
  createTitleMessage,
  parseClientMessage,
  serializeServerMessage
} from './types.js';

export { BlockModel } from './block-model.js';

export { createNativeTerminalServer } from './server.js';
export type { NativeTerminalServer, NativeTerminalServerOptions } from './server.js';

export { handleHttpRequest } from './http-handler.js';

// === Command Block API ===

export {
  OutputRedactor,
  createRedactor,
  redactSensitive,
  BUILTIN_PATTERNS
} from './output-redactor.js';
export type { RedactionPattern, RedactionConfig, RedactionStats } from './output-redactor.js';

export { BlockStore, createBlockStore } from './block-store.js';

export { EphemeralExecutor, createEphemeralExecutor } from './ephemeral-executor.js';
export type { ExecutorEvent, ExecutorEventCallback } from './ephemeral-executor.js';

export { PersistentExecutor, createPersistentExecutor } from './persistent-executor.js';
export type {
  PersistentExecutorEvent,
  PersistentExecutorEventCallback
} from './persistent-executor.js';

export {
  BlockEventEmitter,
  createBlockEventEmitter,
  createBlockSSEStream,
  formatSSEEvent
} from './block-event-emitter.js';
export type { BlockEventListener } from './block-event-emitter.js';

export {
  CommandExecutorManager,
  createCommandExecutorManager
} from './command-executor-manager.js';

export type {
  ExtendedBlock,
  ExtendedBlockStatus,
  ExecutionMode,
  SubmissionSource,
  BlockErrorType,
  GitInfo,
  AgentMeta,
  OutputChunk,
  CommandRequest,
  CommandResponse,
  IntegrationStatus,
  RetentionPolicy,
  CancelRequest,
  CancelResponse,
  ChunkQueryParams,
  ChunkQueryResponse,
  BlockEventType,
  BlockEvent
} from './types.js';

export { DEFAULT_RETENTION_POLICY } from './types.js';
