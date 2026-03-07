/**
 * NativeSessionManager - Manages multiple native terminal sessions
 *
 * This class provides session lifecycle management for Bun.Terminal-based
 * terminal sessions, similar to SessionManager for terminal sessions.
 */

import type { Config, NativeTerminalConfig } from '@/core/config/types.js';
import type { NativeTerminalWebSocket, TerminalSessionInfo } from '@/core/protocol/index.js';
import { TerminalSession } from '@/core/terminal/session.js';

export interface NativeSessionOptions {
  /** Session name */
  name: string;
  /** Working directory */
  dir: string;
  /** URL path (e.g., /bunterm/my-session) */
  path: string;
  /** Initial terminal columns */
  cols?: number;
  /** Initial terminal rows */
  rows?: number;
}

export interface NativeSessionState {
  name: string;
  dir: string;
  path: string;
  pid: number;
  startedAt: string;
  clientCount: number;
}

export class NativeSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private readonly config: Config;
  private readonly nativeConfig: NativeTerminalConfig;

  constructor(config: Config) {
    this.config = config;
    this.nativeConfig = config.native_terminal;
  }

  /**
   * Create and start a new native terminal session
   */
  async createSession(options: NativeSessionOptions): Promise<TerminalSession> {
    const { name, dir, cols, rows } = options;

    // Check if session already exists
    if (this.sessions.has(name)) {
      throw new Error(`Session ${name} already exists`);
    }

    // Build command based on tmux_mode
    const command = this.buildCommand(name);

    // Create terminal session
    const session = new TerminalSession({
      name,
      command,
      cwd: dir,
      cols: cols ?? 80,
      rows: rows ?? 24,
      outputBufferSize: this.nativeConfig.output_buffer_size
    });

    // Start the session
    await session.start();

    // Store session
    this.sessions.set(name, session);

    return session;
  }

  /**
   * Build the command to run based on tmux_mode
   */
  private buildCommand(sessionName: string): string[] {
    const tmuxMode = this.config.tmux_mode;

    switch (tmuxMode) {
      case 'attach':
        // Only attach to existing tmux session
        return ['tmux', 'attach-session', '-t', sessionName];

      case 'new':
        // Always create new tmux session
        return ['tmux', 'new-session', '-s', sessionName];

      case 'none':
        // Direct shell without tmux (for native terminal mode)
        // Use -i for interactive mode to ensure the shell doesn't exit
        return [process.env['SHELL'] || '/bin/bash', '-i'];
      default:
        // Create or attach (new -A)
        return ['tmux', 'new-session', '-A', '-s', sessionName];
    }
  }

  /**
   * Get a session by name
   */
  getSession(name: string): TerminalSession | undefined {
    return this.sessions.get(name);
  }

  /**
   * Get a session by URL path
   */
  getSessionByPath(path: string): TerminalSession | undefined {
    // Remove base path prefix and trailing slash
    const basePath = this.config.base_path;
    let sessionPath = path;

    if (sessionPath.startsWith(basePath)) {
      sessionPath = sessionPath.slice(basePath.length);
    }

    if (sessionPath.startsWith('/')) {
      sessionPath = sessionPath.slice(1);
    }

    // Remove /ws suffix for WebSocket paths
    if (sessionPath.endsWith('/ws')) {
      sessionPath = sessionPath.slice(0, -3);
    }

    // Remove trailing slash
    if (sessionPath.endsWith('/')) {
      sessionPath = sessionPath.slice(0, -1);
    }

    // The remaining path should be the session name
    return this.sessions.get(sessionPath);
  }

  /**
   * Check if a session exists
   */
  hasSession(name: string): boolean {
    return this.sessions.has(name);
  }

  /**
   * Stop a session
   */
  async stopSession(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (!session) {
      throw new Error(`Session ${name} not found`);
    }

    await session.stop();
    this.sessions.delete(name);
  }

  /**
   * Stop all sessions
   */
  async stopAll(): Promise<void> {
    const names = Array.from(this.sessions.keys());

    await Promise.all(names.map((name) => this.stopSession(name).catch((_err) => {})));
  }

  /**
   * Handle a WebSocket connection for a session
   */
  handleWebSocket(sessionName: string, ws: NativeTerminalWebSocket): TerminalSession | undefined {
    const session = this.sessions.get(sessionName);
    if (!session) {
      return undefined;
    }

    session.addClient(ws);
    return session;
  }

  /**
   * Handle WebSocket disconnect
   */
  handleWebSocketClose(sessionName: string, ws: NativeTerminalWebSocket): void {
    const session = this.sessions.get(sessionName);
    if (session) {
      session.removeClient(ws);
    }
  }

  /**
   * Get list of all sessions
   */
  listSessions(): NativeSessionState[] {
    return Array.from(this.sessions.values()).map((session) => {
      const info = session.getInfo();
      return {
        name: info.name,
        dir: info.cwd,
        path: `${this.config.base_path}/${info.name}`,
        pid: info.pid,
        startedAt: info.startedAt,
        clientCount: info.clientCount
      };
    });
  }

  /**
   * Get session info
   */
  getSessionInfo(name: string): TerminalSessionInfo | undefined {
    return this.sessions.get(name)?.getInfo();
  }

  /**
   * Get all session names
   */
  getSessionNames(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get count of active sessions
   */
  get sessionCount(): number {
    return this.sessions.size;
  }
}
