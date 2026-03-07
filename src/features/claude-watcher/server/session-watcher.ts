/**
 * Claude Session Watcher
 *
 * Watches Claude Code session files and emits messages when new
 * conversation entries are detected.
 *
 * Uses fs.watch for efficient file monitoring with offset tracking
 * to read only new content.
 */

import { EventEmitter } from 'node:events';
import { type FSWatcher, watch } from 'node:fs';
import { stat } from 'node:fs/promises';

import { parseHistoryEntry, parseSessionLines } from './message-parser.js';
import { cwdToProjectPath, getHistoryFilePath, getSessionFilePath } from './path-utils.js';
import type {
  ClaudeSessionStartWS,
  ClaudeSessionWatcherOptions,
  ClaudeWatcherMessage
} from './types.js';

interface ClaudeSessionWatcherEvents {
  message: [msg: ClaudeWatcherMessage];
  error: [err: Error];
  sessionStart: [sessionId: string, project: string];
  sessionEnd: [sessionId: string];
}

export class ClaudeSessionWatcher extends EventEmitter<ClaudeSessionWatcherEvents> {
  private cwd: string;
  private claudeDir: string;
  private projectPath: string;
  private includeThinking: boolean;
  private maxToolResultSize: number;

  private activeSessionId: string | null = null;
  private historyWatcher: FSWatcher | null = null;
  private sessionWatcher: FSWatcher | null = null;

  private historyPosition = 0;
  private sessionPosition = 0;

  private isRunning = false;
  private debounceTimer: Timer | null = null;

  constructor(options: ClaudeSessionWatcherOptions) {
    super();
    this.cwd = options.cwd;
    this.claudeDir = options.claudeDir ?? `${process.env['HOME']}/.claude`;
    this.projectPath = cwdToProjectPath(this.cwd);
    this.includeThinking = options.includeThinking ?? true;
    this.maxToolResultSize = options.maxToolResultSize ?? 10000;
  }

  /**
   * Start watching for Claude session changes
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    try {
      // Check if Claude directory exists
      const historyPath = getHistoryFilePath(this.claudeDir);
      try {
        await stat(historyPath);
      } catch {}

      // Start watching history.jsonl for session changes
      await this.watchHistory();

      // Try to find active session from history
      await this.detectActiveSession();
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.isRunning = false;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.historyWatcher) {
      this.historyWatcher.close();
      this.historyWatcher = null;
    }

    if (this.sessionWatcher) {
      this.sessionWatcher.close();
      this.sessionWatcher = null;
    }

    if (this.activeSessionId) {
      this.emit('sessionEnd', this.activeSessionId);
      this.activeSessionId = null;
    }
  }

  /**
   * Get the current active session ID
   */
  get sessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Watch history.jsonl for session changes
   */
  private async watchHistory(): Promise<void> {
    const historyPath = getHistoryFilePath(this.claudeDir);

    try {
      // Get initial file size
      const fileStat = await stat(historyPath);
      this.historyPosition = fileStat.size;
    } catch {
      this.historyPosition = 0;
    }

    try {
      this.historyWatcher = watch(historyPath, async (event) => {
        if (event === 'change') {
          try {
            await this.readNewHistoryLines();
          } catch (_err) {}
        }
      });

      this.historyWatcher.on('error', (_err) => {
        // Try to recover by restarting the watcher after a delay
        this.historyWatcher?.close();
        this.historyWatcher = null;
        setTimeout(() => {
          if (this.isRunning) {
            this.watchHistory().catch(() => {});
          }
        }, 5000);
      });
    } catch (_err) {}
  }

  /**
   * Read new lines from history.jsonl
   */
  private async readNewHistoryLines(): Promise<void> {
    const historyPath = getHistoryFilePath(this.claudeDir);

    try {
      const file = Bun.file(historyPath);
      const fileStat = await file.stat();

      if (fileStat.size <= this.historyPosition) {
        return;
      }

      // Read new content
      const slice = file.slice(this.historyPosition, fileStat.size);
      const text = await slice.text();
      this.historyPosition = fileStat.size;

      // Parse new lines
      const lines = text.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        const entry = parseHistoryEntry(line);
        if (!entry) {
          continue;
        }

        // Check if this entry is for our project and has a session ID
        if (entry.project === this.cwd && entry.sessionId) {
          if (entry.sessionId !== this.activeSessionId) {
            await this.switchSession(entry.sessionId);
          }
        }
      }
    } catch (_err) {}
  }

  /**
   * Detect active session from recent history entries
   */
  private async detectActiveSession(): Promise<void> {
    const historyPath = getHistoryFilePath(this.claudeDir);

    try {
      const file = Bun.file(historyPath);
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());

      // Search from the end for a matching project
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 100; i--) {
        const line = lines[i];
        if (!line) {
          continue;
        }
        const entry = parseHistoryEntry(line);
        const sessionId = entry?.sessionId;
        if (entry && entry.project === this.cwd && sessionId) {
          await this.switchSession(sessionId);
          break;
        }
      }
    } catch {
      // History file doesn't exist yet
    }
  }

  /**
   * Switch to a new session
   */
  private async switchSession(sessionId: string): Promise<void> {
    // Stop watching old session
    if (this.sessionWatcher) {
      this.sessionWatcher.close();
      this.sessionWatcher = null;
    }

    if (this.activeSessionId) {
      this.emit('sessionEnd', this.activeSessionId);
    }

    this.activeSessionId = sessionId;
    this.sessionPosition = 0;

    // Emit session start
    const startMsg: ClaudeSessionStartWS = {
      type: 'claudeSessionStart',
      sessionId,
      project: this.cwd,
      timestamp: new Date().toISOString()
    };
    this.emit('message', startMsg);
    this.emit('sessionStart', sessionId, this.cwd);

    // Start watching the new session file
    await this.watchSession(sessionId);
  }

  /**
   * Watch a session file for new entries
   */
  private async watchSession(sessionId: string): Promise<void> {
    const sessionPath = getSessionFilePath(this.projectPath, sessionId, this.claudeDir);

    try {
      // Get initial file size (skip existing content)
      const file = Bun.file(sessionPath);
      const fileStat = await file.stat();
      this.sessionPosition = fileStat.size;
    } catch {
      this.sessionPosition = 0;
    }

    try {
      this.sessionWatcher = watch(sessionPath, (event) => {
        if (event === 'change') {
          // Debounce rapid changes
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = setTimeout(() => {
            this.readNewSessionLines(sessionId).catch((_err) => {});
          }, 50);
        }
      });

      this.sessionWatcher.on('error', (_err) => {
        // Close the broken watcher - it will be recreated on next session switch
        this.sessionWatcher?.close();
        this.sessionWatcher = null;
      });
    } catch (_err) {}
  }

  /**
   * Read new lines from session file
   */
  private async readNewSessionLines(sessionId: string): Promise<void> {
    if (sessionId !== this.activeSessionId) {
      return;
    }

    const sessionPath = getSessionFilePath(this.projectPath, sessionId, this.claudeDir);

    try {
      const file = Bun.file(sessionPath);
      const fileStat = await file.stat();

      if (fileStat.size <= this.sessionPosition) {
        return;
      }

      // Read new content
      const slice = file.slice(this.sessionPosition, fileStat.size);
      const text = await slice.text();
      this.sessionPosition = fileStat.size;

      // Parse and emit messages
      const lines = text.split('\n').filter((line) => line.trim());
      const messages = parseSessionLines(lines, {
        includeThinking: this.includeThinking,
        maxToolResultSize: this.maxToolResultSize
      });

      for (const msg of messages) {
        this.emit('message', msg);
      }
    } catch (_err) {}
  }
}
