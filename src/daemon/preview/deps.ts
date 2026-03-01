/**
 * Preview Module Dependencies
 *
 * Dependency injection interfaces for testability.
 */

import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import type { SessionState } from '@/config/types.js';
import { resolveFilePath } from '../file-transfer.js';

// =============================================================================
// FileSystem Interface
// =============================================================================

/** Handle returned by watch operation */
export interface WatchHandle {
  close(): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** File stat result */
export interface FileStat {
  isDirectory(): boolean;
  isFile(): boolean;
}

/** File system operations for file watching */
export interface FileSystemDeps {
  /** Check if file exists */
  existsSync(path: string): boolean;
  /** Watch a file for changes */
  watch(path: string, callback: (eventType: string) => void): WatchHandle;
  /** Read file contents as UTF-8 string */
  readFileSync(path: string): string;
  /** Read directory entries */
  readdirSync(path: string): string[];
  /** Get file/directory stats */
  statSync(path: string): FileStat;
}

/** Default file system implementation */
export const defaultFileSystemDeps: FileSystemDeps = {
  existsSync,
  watch: (path, callback) => {
    const watcher = watch(path, callback);
    return {
      close: () => watcher.close(),
      on: (event, listener) => {
        watcher.on(event, listener);
      }
    };
  },
  readFileSync: (path) => readFileSync(path, 'utf-8'),
  readdirSync,
  statSync
};

/** Create mock file system for testing */
export function createMockFileSystem(overrides: Partial<FileSystemDeps> = {}): FileSystemDeps {
  return {
    existsSync: () => true,
    watch: () => ({
      close: () => {
        // Mock close - no-op
      },
      on: () => {
        // Mock on - no-op
      }
    }),
    readFileSync: () => '',
    readdirSync: () => [],
    statSync: () => ({
      isDirectory: () => false,
      isFile: () => true
    }),
    ...overrides
  };
}

// =============================================================================
// Path Resolver Interface
// =============================================================================

/** Path resolution and validation */
export interface PathResolverDeps {
  /** Resolve and validate a relative path within a base directory */
  resolveFilePath(baseDir: string, relativePath: string): string | null;
}

/** Default path resolver implementation */
export const defaultPathResolverDeps: PathResolverDeps = {
  resolveFilePath
};

/** Create mock path resolver for testing */
export function createMockPathResolver(
  overrides: Partial<PathResolverDeps> = {}
): PathResolverDeps {
  return {
    resolveFilePath: (baseDir, relativePath) => `${baseDir}/${relativePath}`,
    ...overrides
  };
}

// =============================================================================
// Timer Interface
// =============================================================================

/** Timer operations for debouncing */
export interface TimerDeps {
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(timer: NodeJS.Timeout): void;
}

/** Default timer implementation */
export const defaultTimerDeps: TimerDeps = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer)
};

/** Create mock timer for testing */
export function createMockTimer(
  overrides: Partial<TimerDeps> = {}
): TimerDeps & { flush(): void; pending(): number } {
  const timers: Array<{ callback: () => void; id: NodeJS.Timeout }> = [];
  let nextId = 1;

  return {
    setTimeout: (callback, _ms) => {
      const id = nextId++ as unknown as NodeJS.Timeout;
      timers.push({ callback, id });
      return id;
    },
    clearTimeout: (timer) => {
      const index = timers.findIndex((t) => t.id === timer);
      if (index !== -1) {
        timers.splice(index, 1);
      }
    },
    /** Flush all pending timers (for testing) */
    flush: () => {
      const pending = [...timers];
      timers.length = 0;
      for (const { callback } of pending) {
        callback();
      }
    },
    /** Get count of pending timers */
    pending: () => timers.length,
    ...overrides
  };
}

// =============================================================================
// Session Manager Interface
// =============================================================================

/** Session manager operations needed by preview */
export interface SessionManagerDeps {
  /** List all active sessions */
  listSessions(): SessionState[];
}

/** Create mock session manager for testing */
export function createMockSessionManager(sessions: SessionState[] = []): SessionManagerDeps {
  return {
    listSessions: () => sessions
  };
}

// =============================================================================
// Combined Dependencies
// =============================================================================

/** All dependencies for FileWatcherService */
export interface FileWatcherDeps {
  fs: FileSystemDeps;
  pathResolver: PathResolverDeps;
  timer: TimerDeps;
}

/** Default dependencies for FileWatcherService */
export const defaultFileWatcherDeps: FileWatcherDeps = {
  fs: defaultFileSystemDeps,
  pathResolver: defaultPathResolverDeps,
  timer: defaultTimerDeps
};

/** Create mock dependencies for FileWatcherService testing */
export function createMockFileWatcherDeps(
  overrides: Partial<FileWatcherDeps> = {}
): FileWatcherDeps {
  return {
    fs: createMockFileSystem(),
    pathResolver: createMockPathResolver(),
    timer: createMockTimer(),
    ...overrides
  };
}
