/**
 * File Watcher Client
 *
 * Client for receiving file change notifications through the terminal WebSocket.
 * Uses the existing terminal connection instead of creating a separate WebSocket.
 */

import type { TerminalUiConfig } from '@/browser/shared/types.js';
import { getSessionNameFromURL } from '@/browser/shared/utils.js';

/** File change event from server */
export interface FileChangeEvent {
  type: 'change';
  session: string;
  path: string;
  timestamp: number;
}

export class FileWatcherClient {
  private sessionName: string;
  private changeListeners: Array<(event: FileChangeEvent) => void> = [];
  private watchedFiles: Set<string> = new Set();
  private unsubscribe: (() => void) | null = null;
  private isSetup = false;

  constructor(config: TerminalUiConfig) {
    this.sessionName = getSessionNameFromURL(config.base_path);
  }

  /**
   * Setup file change listener with the terminal client.
   * This should be called after the terminal client is available.
   */
  private setup(): void {
    if (this.isSetup) {
      return;
    }

    const client = window.__TERMINAL_CLIENT__;
    if (!client) {
      return;
    }

    // Register file change listener with the terminal client
    this.unsubscribe = client.onFileChange((path, timestamp) => {
      this.handleFileChange(path, timestamp);
    });

    this.isSetup = true;

    // Re-subscribe to any files that were requested before setup
    for (const key of this.watchedFiles) {
      if (key.startsWith('dir:')) {
        const dirPath = key.slice(4);
        client.watchDir(dirPath);
      } else {
        client.watchFile(key);
      }
    }
  }

  /**
   * Connect to the file watcher.
   * For backward compatibility - this now just ensures the terminal client listener is setup.
   */
  connect(): void {
    this.setup();
  }

  /**
   * Disconnect from the file watcher
   */
  disconnect(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isSetup = false;
    this.watchedFiles.clear();
  }

  /**
   * Watch a file for changes
   * @param _session Session name (ignored, uses current session)
   * @param path File path relative to session directory
   */
  watch(_session: string, path: string): void {
    // Store in watchedFiles for reconnection
    this.watchedFiles.add(path);

    // Setup listener if not already done
    this.setup();

    // Send watch message to server
    const client = window.__TERMINAL_CLIENT__;
    if (client?.isConnected) {
      client.watchFile(path);
    }
  }

  /**
   * Stop watching a file
   * @param _session Session name (ignored, uses current session)
   * @param path File path relative to session directory
   */
  unwatch(_session: string, path: string): void {
    this.watchedFiles.delete(path);

    const client = window.__TERMINAL_CLIENT__;
    if (client?.isConnected) {
      client.unwatchFile(path);
    }
  }

  /**
   * Watch a directory recursively for changes
   * @param _session Session name (ignored, uses current session)
   * @param path Directory path relative to session directory
   */
  watchDir(_session: string, path: string): void {
    const key = `dir:${path}`;
    this.watchedFiles.add(key);

    // Setup listener if not already done
    this.setup();

    const client = window.__TERMINAL_CLIENT__;
    if (client?.isConnected) {
      client.watchDir(path);
    }
  }

  /**
   * Stop watching a directory
   * @param _session Session name (ignored, uses current session)
   * @param path Directory path relative to session directory
   */
  unwatchDir(_session: string, path: string): void {
    const key = `dir:${path}`;
    this.watchedFiles.delete(key);

    const client = window.__TERMINAL_CLIENT__;
    if (client?.isConnected) {
      client.unwatchDir(path);
    }
  }

  /**
   * Stop watching all files
   */
  unwatchAll(): void {
    const client = window.__TERMINAL_CLIENT__;
    if (client?.isConnected) {
      for (const key of this.watchedFiles) {
        if (key.startsWith('dir:')) {
          client.unwatchDir(key.slice(4));
        } else {
          client.unwatchFile(key);
        }
      }
    }
    this.watchedFiles.clear();
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
   * Check if connected (terminal client is available and connected)
   */
  isConnected(): boolean {
    return window.__TERMINAL_CLIENT__?.isConnected ?? false;
  }

  /**
   * Get connection state
   */
  getState(): 'disconnected' | 'connecting' | 'connected' {
    if (!window.__TERMINAL_CLIENT__) {
      return 'disconnected';
    }
    return window.__TERMINAL_CLIENT__.isConnected ? 'connected' : 'connecting';
  }

  /**
   * Handle file change from terminal client
   */
  private handleFileChange(path: string, timestamp: number): void {
    const event: FileChangeEvent = {
      type: 'change',
      session: this.sessionName,
      path,
      timestamp
    };

    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch {
        // Listener error - silently ignore
      }
    }
  }
}
