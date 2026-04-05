/**
 * TerminalSession - Manages a single PTY session using Bun.Terminal
 *
 * This class wraps Bun's built-in Terminal API to provide:
 * - PTY lifecycle management
 * - Multi-client broadcasting (via ClientBroadcaster)
 * - Output buffering for AI features
 * - OSC 633 parsing for block UI (via Osc633Parser)
 * - WebSocket protocol handling
 */

import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { match } from 'ts-pattern';
import {
  type Block,
  type ClientMessage,
  createBellMessage,
  createBlockEndMessage,
  createBlockOutputMessage,
  createBlockStartMessage,
  createExitMessage,
  createFileChangeMessage,
  createOutputMessage,
  createPongMessage,
  type NativeTerminalWebSocket,
  parseClientMessage,
  serializeServerMessage,
  type TerminalSessionInfo,
  type TerminalSessionOptions
} from '@/core/protocol/index.js';
import { ClientBroadcaster } from './broadcaster.js';
import { applyCjkWorkaround, needsCjkWorkaround } from './cjk-workaround.js';
import { filterDAResponses, filterFocusEvents } from './da-responder.js';
import { fixOsc52ClipboardTarget } from './dcs-handler.js';
import { type OscNotification, parseOscNotifications } from './osc-notification-parser.js';
import {
  type OSC633Sequence,
  Osc633Parser,
  parseExitCode,
  parseProperty,
  unescapeOsc633Command
} from './osc633-parser.js';
import type { BlockManager, FileChangeNotifier, SessionWatcher } from './session-plugins.js';
import { nullPlugins, type SessionPlugins } from './session-plugins.js';
import { buildShellEnvInjection } from './shell-env-injection.js';

// Bell character (ASCII 7)
const BELL_CHAR = 0x07;

// Resolve osc633-sender binary path (built with bun build --compile)
// Try multiple locations: project root dist/ (dev mode) and relative to compiled output
const __dirname = dirname(fileURLToPath(import.meta.url));
function findOsc633Sender(): string | null {
  const candidates = [
    join(__dirname, '../../../dist/osc633-sender'), // from src/core/terminal/ → project root dist/
    join(__dirname, '../../dist/osc633-sender'), // from compiled output
    join(process.cwd(), 'dist/osc633-sender') // fallback: cwd-relative
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
const OSC633_SENDER_PATH = findOsc633Sender();

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_OUTPUT_BUFFER_SIZE = 1000;

// Bun.Terminal type (not exported by Bun types yet)
interface BunTerminal {
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  close(): void;
  closed: boolean;
}

export class TerminalSession implements AsyncDisposable {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private terminal: BunTerminal | null = null;
  private readonly startedAt: string;
  private currentCols: number;
  private currentRows: number;
  private exitCode: number | null = null;

  // Extracted components
  private readonly broadcaster: ClientBroadcaster;
  private readonly oscParser: Osc633Parser;
  private readonly blockModel: BlockManager;
  private readonly claudeWatcher: SessionWatcher;
  private readonly fileWatcher: FileChangeNotifier;

  // Raw output listeners (for Unix socket relay)
  private readonly rawOutputListeners: Set<(data: Uint8Array) => void> = new Set();

  // PTY master file descriptor (for fd passing to CLI attach clients)
  private _ptyMasterFd: number | null = null;

  // Block UI state
  private currentLine = 0;
  private pendingCommand: string | null = null;
  private blockUIEnabled = true;

  // Side-channel dedup: track last injected OSC 633 to skip duplicate from stdout
  private lastInjectedOsc633: { type: string; timestamp: number } | null = null;

  // Temp directory created for zsh ZDOTDIR injection; cleaned up on session exit
  private injectionCleanupDir: string | null = null;

  // Claude watcher last message tracking (for agent status)
  private lastWatcherMessage: { type: string; timestamp: string; toolName?: string } | null = null;

  readonly name: string;
  readonly cwd: string;
  readonly command: string[];

  constructor(
    private readonly options: TerminalSessionOptions,
    plugins: SessionPlugins = nullPlugins
  ) {
    this.name = options.name;
    this.cwd = options.cwd;
    this.command = options.command;
    this.currentCols = options.cols ?? DEFAULT_COLS;
    this.currentRows = options.rows ?? DEFAULT_ROWS;
    this.startedAt = new Date().toISOString();

    // Initialize extracted components
    this.broadcaster = new ClientBroadcaster({
      maxOutputBuffer: options.outputBufferSize ?? DEFAULT_OUTPUT_BUFFER_SIZE
    });
    this.oscParser = new Osc633Parser();

    // Inject feature plugins
    this.blockModel = plugins.blockManager;
    this.claudeWatcher = plugins.sessionWatcher;
    this.fileWatcher = plugins.fileChangeNotifier;
    this.fileWatcher.setOnChange((path) => this.broadcastFileChange(path));

    // Wire claude watcher events to broadcaster
    this.claudeWatcher.on('message', (msg) => {
      // Track last message for agent status reporting
      // biome-ignore lint: watcher message lacks typed property
      const toolName = msg.type === 'claudeToolUse' ? (msg as any).toolName : undefined;
      // biome-ignore lint: watcher message lacks typed property
      const isError = msg.type === 'claudeToolResult' && (msg as any).isError;
      this.lastWatcherMessage = {
        type: isError ? 'claudeToolResultError' : msg.type,
        // biome-ignore lint: watcher message lacks typed property
        timestamp: 'timestamp' in msg ? (msg as any).timestamp : new Date().toISOString(),
        toolName
      };
      this.broadcaster.broadcast(msg);
    });
    this.claudeWatcher.on('error', (err) => {
      console.debug(`[Session:${this.name}] Claude watcher error:`, err);
    });
  }

  /**
   * Start the PTY process
   */
  async start(): Promise<void> {
    if (this.proc) {
      throw new Error(`Session ${this.name} is already running`);
    }

    // Snapshot PTY fds before spawn to detect new master fd
    const ptyFdsBefore = this.detectPtmxFds();

    // Build shell-specific env injection (e.g. PROMPT_COMMAND for bash, ZDOTDIR for zsh)
    const injection = buildShellEnvInjection(this.command, process.env as Record<string, string>);
    if (injection.cleanupDir) {
      this.injectionCleanupDir = injection.cleanupDir;
    }

    // Use Bun.Terminal for PTY management
    this.proc = Bun.spawn(this.command, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        ...injection.env,
        TERM: 'xterm-256color',
        // Enable shell integration for block UI
        BUNTERM_NATIVE: '1',
        // Side-channel: session name and API socket path for osc633-sender
        BUNTERM_SESSION: this.name,
        BUNTERM_API_SOCK: this.options.apiSocketPath ?? '',
        ...(OSC633_SENDER_PATH ? { BUNTERM_OSC633_SENDER: OSC633_SENDER_PATH } : {})
      },
      terminal: {
        cols: this.currentCols,
        rows: this.currentRows,
        data: (_terminal: BunTerminal, data: Uint8Array) => {
          this.handleOutput(data);
        },
        exit: (_terminal: BunTerminal, _code: number) => {}
      }
    });

    // Detect PTY master fd by diffing before/after spawn
    const ptyFdsAfter = this.detectPtmxFds();
    const newFds = ptyFdsAfter.filter((fd) => !ptyFdsBefore.includes(fd));
    if (newFds.length > 0) {
      this._ptyMasterFd = newFds[0];
    }

    // Get terminal reference with runtime validation
    // biome-ignore lint: Bun.Terminal proc lacks typed terminal property
    const procAny = this.proc as any;
    if (!procAny.terminal || typeof procAny.terminal.write !== 'function') {
      throw new Error('Bun.spawn with terminal option did not return a valid terminal object');
    }
    this.terminal = procAny.terminal as BunTerminal;

    // Handle process exit
    this.proc.exited.then((code) => {
      this.exitCode = code;
      this.broadcaster.broadcast(createExitMessage(code));
      this.cleanup();
    });

    // Start Claude Session Watcher
    this.claudeWatcher.start().catch((err) => {
      console.debug(`[Session:${this.name}] Claude watcher start failed:`, err);
    });
  }

  /**
   * Handle output data from PTY
   */
  private handleOutput(data: Uint8Array): void {
    // Notify raw output listeners (Unix socket relay)
    for (const listener of this.rawOutputListeners) {
      try {
        listener(data);
      } catch {
        // Listener error — ignore to avoid breaking other listeners
      }
    }

    // Check for bell character and send bell message
    if (data.includes(BELL_CHAR)) {
      this.broadcaster.broadcast(createBellMessage());
    }

    // Convert to string for OSC parsing
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);

    // Fix OSC 52 clipboard sequences partially processed by tmux
    const processedText = fixOsc52ClipboardTarget(text);

    // Parse OSC 633 sequences using extracted parser
    const { filteredOutput, sequences } = this.oscParser.parse(processedText);

    // Process OSC 633 sequences for block management
    for (const seq of sequences) {
      this.handleOSC633Sequence(seq);
    }

    // Parse OSC 9/99/777 notification sequences
    const { filteredOutput: notifFiltered, notifications } = parseOscNotifications(filteredOutput);
    for (const notif of notifications) {
      this.handleOscNotification(notif);
    }

    // Count newlines to track current line
    for (const char of notifFiltered) {
      if (char === '\n') {
        this.currentLine++;
      }
    }

    // Create output message from filtered output (without OSC sequences)
    const filteredData = new TextEncoder().encode(notifFiltered);
    const message = createOutputMessage(filteredData);
    const serialized = serializeServerMessage(message);

    // Buffer for AI features using extracted broadcaster
    this.broadcaster.bufferOutput(message.data);

    // Append to active block if exists
    const activeBlockId = this.blockModel.activeBlockId;
    if (activeBlockId && this.blockUIEnabled) {
      this.blockModel.appendOutput(activeBlockId, message.data);
      this.broadcaster.broadcast(createBlockOutputMessage(activeBlockId, message.data));
    }

    // Broadcast to all clients
    this.broadcaster.broadcastRaw(serialized);
  }

  /**
   * Handle an OSC 633 sequence for block management
   */
  private handleOSC633Sequence(seq: OSC633Sequence): void {
    if (!this.blockUIEnabled) {
      return;
    }

    // Dedup: skip if this sequence was already received via side-channel within 200ms
    if (this.lastInjectedOsc633) {
      const elapsed = Date.now() - this.lastInjectedOsc633.timestamp;
      if (this.lastInjectedOsc633.type === seq.type && elapsed < 200) {
        this.lastInjectedOsc633 = null;
        return;
      }
    }

    switch (seq.type) {
      case 'A':
        // Prompt start - nothing to do here
        break;

      case 'B':
        // Prompt end / command start - nothing to do here
        // Command will be captured by 'E' sequence
        break;

      case 'C':
        // Pre-execution - start a new block
        if (this.pendingCommand) {
          const block = this.blockModel.startBlock(this.pendingCommand, this.currentLine);
          this.broadcaster.broadcast(createBlockStartMessage(block));
          this.pendingCommand = null;
        }
        break;

      case 'D':
        // Command finished - end the current block
        {
          const exitCode = parseExitCode(seq.data);
          const activeBlockId = this.blockModel.activeBlockId;
          if (activeBlockId) {
            const endedAt = new Date().toISOString();
            this.blockModel.endBlock(activeBlockId, exitCode, this.currentLine);
            this.broadcaster.broadcast(
              createBlockEndMessage(activeBlockId, exitCode, endedAt, this.currentLine)
            );
          }
        }
        break;

      case 'E':
        // Explicit command line - store for 'C' sequence
        if (seq.data) {
          this.pendingCommand = unescapeOsc633Command(seq.data);
        }
        break;

      case 'P':
        // Property - handle Cwd
        {
          const prop = parseProperty(seq.data);
          if (prop?.key === 'Cwd') {
            this.blockModel.setCwd(prop.value);
          }
        }
        break;
    }
  }

  /**
   * Handle an OSC 9/99/777 notification
   */
  private handleOscNotification(_notif: OscNotification): void {
    // Send bell message to trigger browser notification UI
    // TODO: Use notif.title/body + ClaudeSessionWatcher context for rich push notifications
    this.broadcaster.broadcast(createBellMessage());
  }

  /**
   * Write string data to the PTY
   */
  writeString(data: string): void {
    // Filter out DA responses from xterm.js before writing to PTY
    const filtered = filterDAResponses(data);
    if (!filtered) {
      return;
    }
    if (this.terminal && !this.terminal.closed) {
      this.terminal.write(filtered);
    }
  }

  /**
   * Write binary data to the PTY (for mouse events and other binary sequences)
   */
  writeBytes(data: Uint8Array | Buffer): void {
    if (!this.terminal || this.terminal.closed) {
      return;
    }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length === 0) {
      return;
    }

    // Convert to string for filtering and writing
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // Filter out focus events and DA responses from xterm.js
    const afterFocus = filterFocusEvents(raw);
    if (!afterFocus) {
      return;
    }
    const text = filterDAResponses(afterFocus);
    if (!text) {
      return;
    }

    // CJK first-character loss workaround (see ADR 054)
    if (needsCjkWorkaround(text)) {
      applyCjkWorkaround(text, this.terminal);
      return;
    }

    this.terminal.write(text);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      return;
    }

    this.currentCols = cols;
    this.currentRows = rows;

    if (this.terminal && !this.terminal.closed && this.isRunning) {
      try {
        this.terminal.resize(cols, rows);
      } catch (error) {
        console.debug(`[Session:${this.name}] Resize failed:`, error);
      }
    }
  }

  /**
   * Handle an incoming WebSocket message
   */
  handleMessage(ws: NativeTerminalWebSocket, data: string | Record<string, unknown>): void {
    let message: ClientMessage | null;
    if (typeof data === 'string') {
      message = parseClientMessage(data);
    } else {
      // Already validated by Elysia TypeBox — trust the shape
      message = data as ClientMessage;
    }
    if (!message) {
      ws.send(serializeServerMessage({ type: 'error', message: 'Invalid message format' }));
      return;
    }

    match(message)
      .with({ type: 'input' }, ({ data }) => {
        // Decode Base64 input data and write to PTY
        try {
          const bytes = Buffer.from(data, 'base64');
          this.writeBytes(bytes);
        } catch {
          // Fallback to string write if Base64 decoding fails
          this.writeString(data);
        }
      })
      .with({ type: 'resize' }, ({ cols, rows }) => {
        this.resize(cols, rows);
      })
      .with({ type: 'ping' }, () => {
        ws.send(serializeServerMessage(createPongMessage()));
      })
      .with({ type: 'watchFile' }, ({ path }) => {
        this.fileWatcher.watchFile(path);
      })
      .with({ type: 'unwatchFile' }, ({ path }) => {
        this.fileWatcher.unwatchFile(path);
      })
      .with({ type: 'watchDir' }, ({ path }) => {
        this.fileWatcher.watchDir(path);
      })
      .with({ type: 'unwatchDir' }, ({ path }) => {
        this.fileWatcher.unwatchDir(path);
      })
      .with({ type: 'replayRequest' }, () => {
        // Replay buffered output to this client (used after terminal reinitialize)
        this.broadcaster.replayTo(ws);
        // Also send block list if block UI is enabled
        if (this.blockUIEnabled) {
          const blocks = this.blockModel.getRecentBlocks(20);
          this.broadcaster.sendBlockList(ws, blocks);
        }
      })
      .exhaustive();
  }

  /**
   * Broadcast file change to all connected clients
   */
  private broadcastFileChange(path: string): void {
    const message = createFileChangeMessage(path);
    this.broadcaster.broadcast(message);
  }

  /**
   * Broadcast a server message to all connected clients
   */
  broadcastMessage(message: import('@/core/protocol/index.js').ServerMessage): void {
    this.broadcaster.broadcast(message);
  }

  /**
   * Add a client WebSocket connection
   */
  addClient(ws: NativeTerminalWebSocket): void {
    this.broadcaster.addClient(ws);

    // Replay buffered output to reconnecting client
    this.broadcaster.replayTo(ws);

    // Send block list for reconnection
    if (this.blockUIEnabled) {
      const blocks = this.blockModel.getRecentBlocks(20);
      this.broadcaster.sendBlockList(ws, blocks);
    }
  }

  /**
   * Remove a client WebSocket connection
   */
  removeClient(ws: NativeTerminalWebSocket): void {
    this.broadcaster.removeClient(ws);
  }

  /**
   * Add a raw output listener (for Unix socket relay).
   * Receives raw PTY output bytes before any processing.
   */
  addRawOutputListener(listener: (data: Uint8Array) => void): void {
    this.rawOutputListeners.add(listener);
  }

  /**
   * Remove a raw output listener.
   */
  removeRawOutputListener(listener: (data: Uint8Array) => void): void {
    this.rawOutputListeners.delete(listener);
  }

  /**
   * Get the number of connected clients
   */
  get clientCount(): number {
    return this.broadcaster.clientCount;
  }

  /**
   * Check if the session is still running
   */
  get isRunning(): boolean {
    return this.proc !== null && this.exitCode === null;
  }

  /**
   * Get the PTY master file descriptor (for fd passing to CLI attach clients).
   * Returns null if not detected (Bun API doesn't expose it directly).
   */
  get ptyMasterFd(): number | null {
    return this._ptyMasterFd;
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
  get info(): TerminalSessionInfo {
    return {
      name: this.name,
      pid: this.proc?.pid ?? 0,
      cwd: this.cwd,
      cols: this.currentCols,
      rows: this.currentRows,
      clientCount: this.broadcaster.clientCount,
      startedAt: this.startedAt
    };
  }

  /**
   * Get buffered output for AI features
   */
  get outputBuffer(): string[] {
    return this.broadcaster.getOutputBuffer();
  }

  /**
   * Clear the output buffer
   */
  clearOutputBuffer(): void {
    this.broadcaster.clearOutputBuffer();
  }

  /**
   * Get all blocks
   */
  get blocks(): Block[] {
    return this.blockModel.allBlocks;
  }

  /**
   * Get a specific block by ID
   */
  getBlock(blockId: string): Block | undefined {
    return this.blockModel.getBlock(blockId);
  }

  /**
   * Get the active (running) block
   */
  get activeBlock(): Block | null {
    return this.blockModel.activeBlock;
  }

  /**
   * Enable or disable block UI
   */
  setBlockUIEnabled(enabled: boolean): void {
    this.blockUIEnabled = enabled;
  }

  /**
   * Get Claude watcher status for agent status reporting
   */
  get claudeWatcherStatus(): {
    sessionId: string | null;
    lastMessage?: { type: string; timestamp: string; toolName?: string };
  } {
    return {
      sessionId: this.claudeWatcher.sessionId,
      lastMessage: this.lastWatcherMessage ?? undefined
    };
  }

  /**
   * Inject an OSC 633 sequence from the side-channel (osc633-sender).
   * Bypasses tmux passthrough by receiving sequences directly via HTTP API.
   */
  injectOSC633(seq: OSC633Sequence): void {
    this.handleOSC633Sequence(seq);
    // Arm dedup AFTER processing so the guard only blocks the subsequent stdout duplicate
    this.lastInjectedOsc633 = { type: seq.type, timestamp: Date.now() };
  }

  /**
   * Check if block UI is enabled
   */
  get isBlockUIEnabled(): boolean {
    return this.blockUIEnabled;
  }

  /**
   * Stop the session
   */
  async stop(): Promise<void> {
    this.cleanup();

    if (this.terminal && !this.terminal.closed) {
      this.terminal.close();
    }

    if (this.proc) {
      try {
        this.proc.kill();
        // Wait a bit for process to exit
        await Promise.race([this.proc.exited, new Promise((resolve) => setTimeout(resolve, 1000))]);
      } catch (error) {
        // Process may already be dead
        console.debug(`[Session:${this.name}] Process kill failed (may already be dead):`, error);
      }
      this.proc = null;
      this.terminal = null;
    }
  }

  /**
   * Detect PTY master fds by scanning /proc/self/fd (Linux only).
   * On macOS, returns empty array (fd detection not supported via procfs).
   */
  private detectPtmxFds(): number[] {
    if (process.platform !== 'linux') return [];
    try {
      const { readdirSync, readlinkSync } = require('node:fs');
      const fds: number[] = [];
      for (const entry of readdirSync('/proc/self/fd')) {
        try {
          const link = readlinkSync(`/proc/self/fd/${entry}`);
          if (link.includes('ptmx')) {
            fds.push(Number.parseInt(entry, 10));
          }
        } catch {
          // fd may have been closed between readdir and readlink
        }
      }
      return fds;
    } catch {
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop Claude Session Watcher
    this.claudeWatcher.stop();

    // Close all file watchers
    this.fileWatcher.close();

    // Close all client connections
    this.broadcaster.closeAll(1000, 'Session ended');

    // Reset OSC parser state
    this.oscParser.reset();

    // Remove temporary ZDOTDIR created for zsh shell-integration injection
    if (this.injectionCleanupDir) {
      try {
        rmSync(this.injectionCleanupDir, { recursive: true, force: true });
      } catch (err) {
        console.debug(`[Session:${this.name}] Failed to remove injection temp dir:`, err);
      }
      this.injectionCleanupDir = null;
    }
  }

  /**
   * Dispose the terminal session asynchronously.
   * Implements Symbol.asyncDispose for use with `await using` declarations.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
