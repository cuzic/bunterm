/**
 * File Watcher
 *
 * Monitors files and directories for changes using node:fs watch API.
 * Used by TerminalSession to notify clients of file changes for live preview.
 */

import { type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';

export interface FileWatcherOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

export class FileWatcher implements Disposable {
  private watchers = new Map<string, FSWatcher>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly debounceMs: number;
  private readonly sessionDir: string;
  private readonly onChange: (relativePath: string) => void;

  constructor(
    sessionDir: string,
    onChange: (relativePath: string) => void,
    options: FileWatcherOptions = {}
  ) {
    this.sessionDir = sessionDir;
    this.onChange = onChange;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * Watch a single file for changes
   * @param relativePath Path relative to session directory
   */
  watchFile(relativePath: string): void {
    if (this.watchers.has(relativePath)) {
      return; // Already watching
    }

    const fullPath = join(this.sessionDir, relativePath);

    try {
      const watcher = watch(fullPath, (eventType) => {
        if (eventType === 'change') {
          this.debounce(relativePath);
        }
      });

      watcher.on('error', (_error) => {
        this.unwatchFile(relativePath);
      });

      this.watchers.set(relativePath, watcher);
    } catch (_error) {}
  }

  /**
   * Stop watching a file
   * @param relativePath Path relative to session directory
   */
  unwatchFile(relativePath: string): void {
    const watcher = this.watchers.get(relativePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(relativePath);
    }

    // Clear any pending debounce timer
    const timer = this.debounceTimers.get(relativePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(relativePath);
    }
  }

  /**
   * Watch a directory recursively for changes
   * @param relativePath Directory path relative to session directory
   */
  watchDir(relativePath: string): void {
    const key = `dir:${relativePath}`;
    if (this.watchers.has(key)) {
      return; // Already watching
    }

    const fullPath = join(this.sessionDir, relativePath);

    try {
      const watcher = watch(fullPath, { recursive: true }, (_eventType, filename) => {
        if (filename) {
          // Construct full relative path from session directory
          const changedPath = relativePath ? join(relativePath, filename) : filename;
          this.debounce(changedPath);
        }
      });

      watcher.on('error', (_error) => {
        this.unwatchDir(relativePath);
      });

      this.watchers.set(key, watcher);
    } catch (_error) {}
  }

  /**
   * Stop watching a directory
   * @param relativePath Directory path relative to session directory
   */
  unwatchDir(relativePath: string): void {
    const key = `dir:${relativePath}`;
    const watcher = this.watchers.get(key);
    if (watcher) {
      watcher.close();
      this.watchers.delete(key);
    }

    // Clear any pending debounce timers for files in this directory
    for (const [path, timer] of this.debounceTimers.entries()) {
      if (path.startsWith(relativePath) || relativePath === '') {
        clearTimeout(timer);
        this.debounceTimers.delete(path);
      }
    }
  }

  /**
   * Check if a file is being watched
   */
  isWatchingFile(relativePath: string): boolean {
    return this.watchers.has(relativePath);
  }

  /**
   * Check if a directory is being watched
   */
  isWatchingDir(relativePath: string): boolean {
    return this.watchers.has(`dir:${relativePath}`);
  }

  /**
   * Get number of active watchers
   */
  get watcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Close all watchers and clean up
   */
  close(): void {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Debounce file change notifications
   */
  private debounce(path: string): void {
    // Clear existing timer for this path
    const existing = this.debounceTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    this.debounceTimers.set(
      path,
      setTimeout(() => {
        this.debounceTimers.delete(path);
        this.onChange(path);
      }, this.debounceMs)
    );
  }

  /**
   * Dispose the file watcher.
   * Implements Symbol.dispose for use with `using` declarations.
   */
  [Symbol.dispose](): void {
    this.close();
  }
}
