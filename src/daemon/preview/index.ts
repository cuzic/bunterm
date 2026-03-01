/**
 * Preview Module
 *
 * HTML preview feature with live reload using WebSocket and fs.watch.
 */

// Types
export type {
  FileChangeEvent,
  PreviewClientMessage,
  PreviewOptions,
  PreviewServerMessage
} from './types.js';

// Dependencies (for DI)
export type {
  FileSystemDeps,
  FileWatcherDeps,
  PathResolverDeps,
  SessionManagerDeps,
  TimerDeps,
  WatchHandle
} from './deps.js';

export {
  createMockFileSystem,
  createMockFileWatcherDeps,
  createMockPathResolver,
  createMockSessionManager,
  createMockTimer,
  defaultFileSystemDeps,
  defaultFileWatcherDeps,
  defaultPathResolverDeps,
  defaultTimerDeps
} from './deps.js';

// FileWatcherService
export { FileWatcherService } from './watcher.js';

// Backward compatible functions
export {
  cleanupWatchers,
  configureWatcher,
  getWatcherStats,
  onFileChange,
  resetDefaultService,
  unwatchAllForClient,
  unwatchDirectory,
  unwatchFile,
  watchDirectory,
  watchFile
} from './watcher.js';

// Gitignore matcher
export { GitignoreMatcher } from './gitignore.js';

// PreviewWsHandler
export type {
  PreviewWsHandlerDeps,
  WebSocketLike,
  WebSocketServerLike
} from './ws-handler.js';

export { PreviewWsHandler } from './ws-handler.js';

// Backward compatible functions
export {
  cleanupPreviewWs,
  getPreviewWsStats,
  handlePreviewUpgrade,
  resetDefaultHandler
} from './ws-handler.js';
