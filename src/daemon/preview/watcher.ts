/**
 * File Watcher Service
 *
 * Watches files for changes using fs.watch and notifies subscribers.
 * Uses dependency injection for testability.
 */

import { join, normalize } from 'node:path';
import { DEFAULT_PREVIEW_CONFIG } from '@/config/types.js';
import { createLogger } from '@/utils/logger.js';
import { type FileWatcherDeps, type WatchHandle, defaultFileWatcherDeps } from './deps.js';
import { GitignoreMatcher } from './gitignore.js';
import type { FileChangeEvent, PreviewOptions } from './types.js';

const log = createLogger('preview-watcher');

/** Maximum number of files to watch in a directory */
const MAX_WATCHED_FILES = 500;

/** Watched file info */
interface WatchedFile<TClient> {
  sessionDir: string;
  relativePath: string;
  fullPath: string;
  clients: Set<TClient>;
}

/** Watched directory info */
interface WatchedDir<TClient> {
  sessionDir: string;
  relativePath: string;
  fullPath: string;
  sessionName: string;
  clients: Set<TClient>;
  watchedPaths: Set<string>;
}

/** Default options (uses config defaults for consistency) */
const DEFAULT_OPTIONS: PreviewOptions = {
  debounceMs: DEFAULT_PREVIEW_CONFIG.debounce_ms,
  allowedExtensions: DEFAULT_PREVIEW_CONFIG.allowed_extensions
};

/**
 * File Watcher Service
 *
 * Manages file watching with debounced change notifications.
 */
export class FileWatcherService<TClient = unknown> {
  private deps: FileWatcherDeps;
  private options: PreviewOptions;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private watchers = new Map<string, WatchHandle>();
  private watchedFiles = new Map<string, WatchedFile<TClient>>();
  private changeListeners: Array<(event: FileChangeEvent) => void> = [];

  // Directory watching state
  private dirWatchers = new Map<string, WatchHandle[]>();
  private watchedDirs = new Map<string, WatchedDir<TClient>>();

  constructor(
    deps: FileWatcherDeps = defaultFileWatcherDeps,
    options: PreviewOptions = DEFAULT_OPTIONS
  ) {
    this.deps = deps;
    this.options = options;
  }

  /**
   * Configure the watcher options
   */
  configure(newOptions: Partial<PreviewOptions>): void {
    this.options = { ...this.options, ...newOptions };
    log.debug('Watcher configured:', this.options);
  }

  /**
   * Get current options
   */
  getOptions(): PreviewOptions {
    return { ...this.options };
  }

  /**
   * Watch a file for changes
   */
  watchFile(
    sessionDir: string,
    relativePath: string,
    sessionName: string,
    client: TClient
  ): boolean {
    // Validate extension
    if (!this.isAllowedExtension(relativePath)) {
      log.warn(`Extension not allowed for preview: ${relativePath}`);
      return false;
    }

    // Resolve and validate path
    const fullPath = this.deps.pathResolver.resolveFilePath(sessionDir, relativePath);
    if (!fullPath) {
      log.warn(`Invalid path for watch: ${relativePath}`);
      return false;
    }

    // Check if file exists
    if (!this.deps.fs.existsSync(fullPath)) {
      log.warn(`File not found for watch: ${fullPath}`);
      return false;
    }

    const key = this.getFileKey(sessionDir, relativePath);

    // Check if already watching
    let watchedFile = this.watchedFiles.get(key);
    if (watchedFile) {
      // Add client to existing watch
      watchedFile.clients.add(client);
      log.debug(`Added client to existing watch: ${key}`);
      return true;
    }

    // Create new watcher
    try {
      const watcher = this.deps.fs.watch(fullPath, (eventType) => {
        if (eventType === 'change') {
          this.emitChange(sessionName, relativePath);
        }
      });

      watcher.on('error', (err) => {
        log.error(`Watcher error for ${fullPath}:`, err);
        this.unwatchFile(sessionDir, relativePath, client);
      });

      this.watchers.set(key, watcher);

      watchedFile = {
        sessionDir,
        relativePath,
        fullPath,
        clients: new Set([client])
      };
      this.watchedFiles.set(key, watchedFile);

      log.info(`Started watching: ${sessionName}/${relativePath}`);
      return true;
    } catch (err) {
      log.error(`Failed to watch file: ${fullPath}`, err);
      return false;
    }
  }

  /**
   * Stop watching a file for a client
   */
  unwatchFile(sessionDir: string, relativePath: string, client: TClient): void {
    const key = this.getFileKey(sessionDir, relativePath);
    const watchedFile = this.watchedFiles.get(key);

    if (!watchedFile) {
      return;
    }

    // Remove client
    watchedFile.clients.delete(client);

    // If no more clients, stop watching
    if (watchedFile.clients.size === 0) {
      const watcher = this.watchers.get(key);
      if (watcher) {
        watcher.close();
        this.watchers.delete(key);
      }
      this.watchedFiles.delete(key);
      log.info(`Stopped watching: ${key}`);
    }
  }

  /**
   * Remove all watches for a client
   */
  unwatchAllForClient(client: TClient): void {
    // Remove client from file watches
    for (const [key, watchedFile] of this.watchedFiles.entries()) {
      if (watchedFile.clients.has(client)) {
        watchedFile.clients.delete(client);

        // If no more clients, stop watching
        if (watchedFile.clients.size === 0) {
          const watcher = this.watchers.get(key);
          if (watcher) {
            watcher.close();
            this.watchers.delete(key);
          }
          this.watchedFiles.delete(key);
          log.debug(`Stopped watching (client disconnected): ${key}`);
        }
      }
    }

    // Remove client from directory watches
    for (const watchedDir of this.watchedDirs.values()) {
      if (watchedDir.clients.has(client)) {
        this.unwatchDirectory(watchedDir.sessionDir, watchedDir.relativePath, client);
      }
    }
  }

  // ===========================================================================
  // Directory Watching
  // ===========================================================================

  /**
   * Watch a directory recursively for file changes
   *
   * - Respects .gitignore patterns
   * - Limits to MAX_WATCHED_FILES files
   * - Ignores node_modules, .git, etc.
   *
   * @param sessionDir Session working directory
   * @param relativePath Relative path to directory within session
   * @param sessionName Session name for events
   * @param client Client to register
   * @returns true if watching started, false on error
   */
  watchDirectory(
    sessionDir: string,
    relativePath: string,
    sessionName: string,
    client: TClient
  ): boolean {
    const fullPath = this.deps.pathResolver.resolveFilePath(sessionDir, relativePath);
    if (!fullPath || !this.deps.fs.existsSync(fullPath)) {
      log.warn(`Directory not found: ${relativePath}`);
      return false;
    }

    // Check if it's actually a directory
    try {
      const stat = this.deps.fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        log.warn(`Not a directory: ${relativePath}`);
        return false;
      }
    } catch {
      log.warn(`Cannot stat: ${relativePath}`);
      return false;
    }

    const key = this.getDirKey(sessionDir, relativePath);

    // Already watching?
    const existingDir = this.watchedDirs.get(key);
    if (existingDir) {
      existingDir.clients.add(client);
      log.debug(`Added client to existing directory watch: ${key}`);
      return true;
    }

    // Create gitignore matcher (looks for .gitignore in session root)
    const gitignore = new GitignoreMatcher(sessionDir, this.deps.fs);

    // Collect files to watch (limited)
    const filesToWatch = this.collectFilesToWatch(fullPath, relativePath, gitignore);
    if (filesToWatch.length === 0) {
      log.warn(`No watchable files in: ${relativePath}`);
      return false;
    }

    log.info(`Watching ${filesToWatch.length} files in: ${sessionName}/${relativePath || '.'}`);

    // Create individual watchers for each file
    const watchers: WatchHandle[] = [];
    const watchedPaths = new Set<string>();

    for (const file of filesToWatch) {
      try {
        const watcher = this.deps.fs.watch(file.fullPath, (eventType) => {
          if (eventType === 'change') {
            this.emitChange(sessionName, file.relativePath);
          }
        });
        watcher.on('error', () => {
          // Ignore individual watcher errors
        });
        watchers.push(watcher);
        watchedPaths.add(file.relativePath);
      } catch {
        // Skip files that can't be watched
      }
    }

    this.dirWatchers.set(key, watchers);
    this.watchedDirs.set(key, {
      sessionDir,
      relativePath,
      fullPath,
      sessionName,
      clients: new Set([client]),
      watchedPaths
    });

    return true;
  }

  /**
   * Stop watching a directory for a client
   */
  unwatchDirectory(sessionDir: string, relativePath: string, client: TClient): void {
    const key = this.getDirKey(sessionDir, relativePath);
    const watchedDir = this.watchedDirs.get(key);
    if (!watchedDir) {
      return;
    }

    watchedDir.clients.delete(client);

    // If no more clients, stop watching
    if (watchedDir.clients.size === 0) {
      const watchers = this.dirWatchers.get(key) || [];
      for (const w of watchers) {
        w.close();
      }
      this.dirWatchers.delete(key);
      this.watchedDirs.delete(key);
      log.info(`Stopped watching directory: ${key}`);
    }
  }

  /**
   * Collect files to watch in a directory (recursive)
   */
  private collectFilesToWatch(
    dirPath: string,
    relativeBase: string,
    gitignore: GitignoreMatcher
  ): Array<{ fullPath: string; relativePath: string }> {
    const files: Array<{ fullPath: string; relativePath: string }> = [];
    this.walkDirectory(dirPath, relativeBase, gitignore, files);
    return files;
  }

  /**
   * Recursively walk a directory and collect files
   */
  private walkDirectory(
    dir: string,
    relDir: string,
    gitignore: GitignoreMatcher,
    files: Array<{ fullPath: string; relativePath: string }>
  ): void {
    if (files.length >= MAX_WATCHED_FILES) {
      return;
    }

    const entries = this.readDirectoryEntries(dir);
    for (const entry of entries) {
      if (files.length >= MAX_WATCHED_FILES) {
        break;
      }
      this.processDirectoryEntry(dir, relDir, entry, gitignore, files);
    }
  }

  /**
   * Read directory entries safely
   */
  private readDirectoryEntries(dir: string): string[] {
    try {
      return this.deps.fs.readdirSync(dir);
    } catch {
      return [];
    }
  }

  /**
   * Process a single directory entry
   */
  private processDirectoryEntry(
    dir: string,
    relDir: string,
    entry: string,
    gitignore: GitignoreMatcher,
    files: Array<{ fullPath: string; relativePath: string }>
  ): void {
    const fullPath = join(dir, entry);
    const relativePath = relDir ? `${relDir}/${entry}` : entry;

    if (gitignore.isIgnored(relativePath)) {
      return;
    }

    try {
      const stat = this.deps.fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this.walkDirectory(fullPath, relativePath, gitignore, files);
      } else if (stat.isFile()) {
        files.push({ fullPath, relativePath });
      }
    } catch {
      // Skip files that can't be stat'd
    }
  }

  /**
   * Generate a unique key for a watched directory
   */
  private getDirKey(sessionDir: string, relativePath: string): string {
    return `dir:${normalize(sessionDir)}:${normalize(relativePath || '.')}`;
  }

  /**
   * Register a file change listener
   */
  onFileChange(callback: (event: FileChangeEvent) => void): () => void {
    this.changeListeners.push(callback);
    return () => {
      const index = this.changeListeners.indexOf(callback);
      if (index !== -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get watcher statistics
   */
  getStats(): { watchedFiles: number; activeClients: number } {
    let activeClients = 0;
    for (const file of this.watchedFiles.values()) {
      activeClients += file.clients.size;
    }
    return {
      watchedFiles: this.watchedFiles.size,
      activeClients
    };
  }

  /**
   * Cleanup all watchers
   */
  cleanup(): void {
    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      this.deps.timer.clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all file watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedFiles.clear();

    // Close all directory watchers
    for (const watchers of this.dirWatchers.values()) {
      for (const watcher of watchers) {
        watcher.close();
      }
    }
    this.dirWatchers.clear();
    this.watchedDirs.clear();

    log.info('All watchers cleaned up');
  }

  /**
   * Generate a unique key for a watched file
   */
  private getFileKey(sessionDir: string, relativePath: string): string {
    return `${normalize(sessionDir)}:${normalize(relativePath)}`;
  }

  /**
   * Check if file extension is allowed
   */
  private isAllowedExtension(path: string): boolean {
    if (this.options.allowedExtensions.length === 0) {
      return true;
    }
    const lowerPath = path.toLowerCase();
    return this.options.allowedExtensions.some((ext) => lowerPath.endsWith(ext.toLowerCase()));
  }

  /**
   * Emit a file change event (debounced)
   */
  private emitChange(session: string, relativePath: string): void {
    const key = `${session}:${relativePath}`;

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      this.deps.timer.clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = this.deps.timer.setTimeout(() => {
      this.debounceTimers.delete(key);

      const event: FileChangeEvent = {
        type: 'change',
        session,
        path: relativePath,
        timestamp: Date.now()
      };

      log.debug(`File changed: ${session}/${relativePath}`);

      // Notify all listeners
      for (const listener of this.changeListeners) {
        try {
          listener(event);
        } catch (err) {
          log.error('Error in change listener:', err);
        }
      }
    }, this.options.debounceMs);

    this.debounceTimers.set(key, timer);
  }
}

// =============================================================================
// Module-level singleton for backward compatibility
// =============================================================================

let defaultService: FileWatcherService | null = null;

function getDefaultService(): FileWatcherService {
  if (!defaultService) {
    defaultService = new FileWatcherService();
  }
  return defaultService;
}

/** Watch a file for changes (backward compatible) */
export function watchFile(
  sessionDir: string,
  relativePath: string,
  sessionName: string,
  client: unknown
): boolean {
  return getDefaultService().watchFile(sessionDir, relativePath, sessionName, client);
}

/** Stop watching a file for a client (backward compatible) */
export function unwatchFile(sessionDir: string, relativePath: string, client: unknown): void {
  getDefaultService().unwatchFile(sessionDir, relativePath, client);
}

/** Remove all watches for a client (backward compatible) */
export function unwatchAllForClient(client: unknown): void {
  getDefaultService().unwatchAllForClient(client);
}

/** Watch a directory for changes (backward compatible) */
export function watchDirectory(
  sessionDir: string,
  relativePath: string,
  sessionName: string,
  client: unknown
): boolean {
  return getDefaultService().watchDirectory(sessionDir, relativePath, sessionName, client);
}

/** Stop watching a directory (backward compatible) */
export function unwatchDirectory(sessionDir: string, relativePath: string, client: unknown): void {
  getDefaultService().unwatchDirectory(sessionDir, relativePath, client);
}

/** Register a file change listener (backward compatible) */
export function onFileChange(callback: (event: FileChangeEvent) => void): () => void {
  return getDefaultService().onFileChange(callback);
}

/** Configure the watcher (backward compatible) */
export function configureWatcher(newOptions: Partial<PreviewOptions>): void {
  getDefaultService().configure(newOptions);
}

/** Get watcher statistics (backward compatible) */
export function getWatcherStats(): { watchedFiles: number; activeClients: number } {
  return getDefaultService().getStats();
}

/** Cleanup all watchers (backward compatible) */
export function cleanupWatchers(): void {
  if (defaultService) {
    defaultService.cleanup();
    defaultService = null;
  }
}

/** Reset default service (for testing) */
export function resetDefaultService(): void {
  if (defaultService) {
    defaultService.cleanup();
    defaultService = null;
  }
}
