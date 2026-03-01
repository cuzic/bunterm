/**
 * TerminalSession - Manages a single PTY session using Bun.Terminal
 *
 * This class wraps Bun's built-in Terminal API to provide:
 * - PTY lifecycle management
 * - Multi-client broadcasting
 * - Output buffering for AI features
 * - WebSocket protocol handling
 */

import {
  type NativeTerminalWebSocket,
  type ServerMessage,
  type TerminalSessionInfo,
  type TerminalSessionOptions,
  createExitMessage,
  createOutputMessage,
  createPongMessage,
  parseClientMessage,
  serializeServerMessage,
} from './types.js';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_OUTPUT_BUFFER_SIZE = 1000;

export class TerminalSession {
  // biome-ignore lint/suspicious/noExplicitAny: Bun.Terminal subprocess type varies
  private proc: any = null;
  private clients: Set<NativeTerminalWebSocket> = new Set();
  private outputBuffer: string[] = [];
  private readonly maxOutputBuffer: number;
  private readonly startedAt: string;
  private currentCols: number;
  private currentRows: number;
  private exitCode: number | null = null;
  private isClosing = false;

  readonly name: string;
  readonly cwd: string;
  readonly command: string[];

  constructor(private readonly options: TerminalSessionOptions) {
    this.name = options.name;
    this.cwd = options.cwd;
    this.command = options.command;
    this.currentCols = options.cols ?? DEFAULT_COLS;
    this.currentRows = options.rows ?? DEFAULT_ROWS;
    this.maxOutputBuffer = options.outputBufferSize ?? DEFAULT_OUTPUT_BUFFER_SIZE;
    this.startedAt = new Date().toISOString();
  }

  /**
   * Start the PTY process
   */
  async start(): Promise<void> {
    if (this.proc) {
      throw new Error(`Session ${this.name} is already running`);
    }

    // Note: Bun.Terminal API requires specific spawn options
    // The terminal option creates a PTY with the specified dimensions
    this.proc = Bun.spawn(this.command, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        TERM: 'xterm-256color',
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
      terminal: {
        cols: this.currentCols,
        rows: this.currentRows,
      },
    });

    // Read stdout and broadcast to clients
    this.readOutput();

    // Handle process exit
    this.proc.exited.then((code: number) => {
      this.exitCode = code;
      this.broadcast(createExitMessage(code));
      this.cleanup();
    });
  }

  /**
   * Read output from the PTY and broadcast to clients
   */
  private async readOutput(): Promise<void> {
    if (!this.proc?.stdout) return;

    const reader = this.proc.stdout.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        this.handleOutput(value);
      }
    } catch (error) {
      if (!this.isClosing) {
        console.error(`[TerminalSession:${this.name}] Read error:`, error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle output data from PTY
   */
  private handleOutput(data: Uint8Array): void {
    const message = createOutputMessage(data);
    const serialized = serializeServerMessage(message);

    // Buffer for AI features
    this.outputBuffer.push(message.data);
    if (this.outputBuffer.length > this.maxOutputBuffer) {
      this.outputBuffer.shift();
    }

    // Broadcast to all clients
    for (const ws of this.clients) {
      try {
        ws.send(serialized);
      } catch {
        // Client disconnected, will be cleaned up
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  private broadcast(message: ServerMessage): void {
    const serialized = serializeServerMessage(message);
    for (const ws of this.clients) {
      try {
        ws.send(serialized);
      } catch {
        // Client disconnected
      }
    }
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    if (this.proc?.stdin) {
      // Write to stdin for terminal input
      const writer = this.proc.stdin.getWriter();
      const encoder = new TextEncoder();
      writer.write(encoder.encode(data));
      writer.releaseLock();
    }
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return;

    this.currentCols = cols;
    this.currentRows = rows;

    // Note: Bun.Terminal resize API
    // This requires the terminal property on the subprocess
    // The exact API may vary based on Bun version
  }

  /**
   * Handle an incoming WebSocket message
   */
  handleMessage(ws: NativeTerminalWebSocket, data: string): void {
    const message = parseClientMessage(data);
    if (!message) {
      ws.send(serializeServerMessage({ type: 'error', message: 'Invalid message format' }));
      return;
    }

    switch (message.type) {
      case 'input':
        this.write(message.data);
        break;
      case 'resize':
        this.resize(message.cols, message.rows);
        break;
      case 'ping':
        ws.send(serializeServerMessage(createPongMessage()));
        break;
    }
  }

  /**
   * Add a client WebSocket connection
   */
  addClient(ws: NativeTerminalWebSocket): void {
    this.clients.add(ws);

    // Send buffered output to new client (for session reconnection)
    if (this.outputBuffer.length > 0) {
      // Send last N lines of buffer
      const replayCount = Math.min(this.outputBuffer.length, 100);
      const replay = this.outputBuffer.slice(-replayCount);
      for (const data of replay) {
        try {
          ws.send(serializeServerMessage({ type: 'output', data }));
        } catch {
          break;
        }
      }
    }
  }

  /**
   * Remove a client WebSocket connection
   */
  removeClient(ws: NativeTerminalWebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if the session is still running
   */
  get isRunning(): boolean {
    return this.proc !== null && this.exitCode === null;
  }

  /**
   * Get the process ID
   */
  get pid(): number | undefined {
    return this.proc?.pid;
  }

  /**
   * Get session info
   */
  getInfo(): TerminalSessionInfo {
    return {
      name: this.name,
      pid: this.proc?.pid ?? 0,
      cwd: this.cwd,
      cols: this.currentCols,
      rows: this.currentRows,
      clientCount: this.clients.size,
      startedAt: this.startedAt,
    };
  }

  /**
   * Get buffered output for AI features
   */
  getOutputBuffer(): string[] {
    return [...this.outputBuffer];
  }

  /**
   * Clear the output buffer
   */
  clearOutputBuffer(): void {
    this.outputBuffer = [];
  }

  /**
   * Stop the session
   */
  async stop(): Promise<void> {
    this.isClosing = true;
    this.cleanup();

    if (this.proc) {
      try {
        this.proc.kill();
        await Promise.race([
          this.proc.exited,
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch {
        // Process may already be dead
      }
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Close all client connections
    for (const ws of this.clients) {
      try {
        ws.close(1000, 'Session ended');
      } catch {
        // Already closed
      }
    }
    this.clients.clear();
  }
}
