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
  isNativeTerminalHtmlPath,
} from './ws-handler.js';
export type { NativeTerminalWebSocketHandlerOptions } from './ws-handler.js';

export type {
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
  TitleMessage,
} from './types.js';

export {
  createErrorMessage,
  createExitMessage,
  createOutputMessage,
  createPongMessage,
  createTitleMessage,
  parseClientMessage,
  serializeServerMessage,
} from './types.js';

export { createNativeTerminalServer } from './server.js';
export type { NativeTerminalServer, NativeTerminalServerOptions } from './server.js';

export { handleHttpRequest } from './http-handler.js';
