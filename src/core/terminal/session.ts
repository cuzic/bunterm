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

import {
  type Block,
  type NativeTerminalWebSocket,
  type TerminalSessionInfo,
  type TerminalSessionOptions,
  createBellMessage,
  createBlockEndMessage,
  createBlockOutputMessage,
  createBlockStartMessage,
  createExitMessage,
  createFileChangeMessage,
  createOutputMessage,
  createPongMessage,
  parseClientMessage,
  serializeServerMessage
} from '@/core/protocol/index.js';
import { match } from 'ts-pattern';
import { BlockModel } from '@/features/blocks/server/block-model.js';
import { ClaudeSessionWatcher } from '@/features/claude-watcher/server/index.js';
import { FileWatcher } from '@/features/file-watcher/server/file-watcher.js';
import { ClientBroadcaster } from './broadcaster.js';
import {
  type OSC633Sequence,
  Osc633Parser,
  parseExitCode,
  parseProperty,
  unescapeOsc633Command
} from './osc633-parser.js';

// Bell character (ASCII 7)
const BELL_CHAR = 0x07;

// CSI (Control Sequence Introducer) for terminal responses
// These are responses FROM the terminal TO applications, not display content
// DA1 response: CSI ? Ps ; Ps ; ... c (e.g., ESC[?64;1;2;...c)
// DA2 response: CSI > Ps ; Ps ; Ps c (e.g., ESC[>0;276;0c)
// DA3 response: CSI = Ps c (e.g., ESC[=...c)
// Note: DA queries (CSI > c or CSI > 0 c) have no semicolons, so we require at least one
// Pattern string - create new RegExp instances to avoid global state race conditions
const CSI_DA_RESPONSE_PATTERN_STR = '\\x1b\\[[>?=]\\d*;\\d+[;\\d]*c';

// Focus events from xterm.js - these can interfere with input timing
// Focus In: ESC [ I
// Focus Out: ESC [ O
const FOCUS_EVENT_PATTERN_STR = '\\x1b\\[[IO]';

// CJK character detection for first-character loss workaround
// Includes: Hiragana, Katakana, CJK Unified Ideographs, Hangul Syllables
const CJK_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

// Newline-only input detection (skip CJK workaround for Enter key)
const NEWLINE_ONLY_PATTERN = /^[\r\n]+$/;

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
  private readonly blockModel: BlockModel;
  private readonly claudeWatcher: ClaudeSessionWatcher;
  private readonly fileWatcher: FileWatcher;

  // Block UI state
  private currentLine = 0;
  private pendingCommand: string | null = null;
  private blockUIEnabled = true;

  readonly name: string;
  readonly cwd: string;
  readonly command: string[];

  constructor(private readonly options: TerminalSessionOptions) {
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
    this.blockModel = new BlockModel(options.cwd);

    // Initialize Claude Session Watcher
    this.claudeWatcher = new ClaudeSessionWatcher({ cwd: options.cwd });
    this.claudeWatcher.on('message', (msg) => {
      this.broadcaster.broadcast(msg);
    });
    this.claudeWatcher.on('error', (err) => {
      console.debug(`[Session:${this.name}] Claude watcher error:`, err);
    });

    // Initialize File Watcher for live preview
    this.fileWatcher = new FileWatcher(options.cwd, (path) => {
      this.broadcastFileChange(path);
    });
  }

  /**
   * Start the PTY process
   */
  async start(): Promise<void> {
    if (this.proc) {
      throw new Error(`Session ${this.name} is already running`);
    }

    // Use Bun.Terminal for PTY management
    this.proc = Bun.spawn(this.command, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...this.options.env,
        TERM: 'xterm-256color',
        // Enable shell integration for block UI
        BUNTERM_NATIVE: '1'
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

    // Get terminal reference with runtime validation
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
    // Check for bell character and send bell message
    if (data.includes(BELL_CHAR)) {
      this.broadcaster.broadcast(createBellMessage());
    }

    // Convert to string for OSC parsing
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);

    // Fix OSC 52 sequences that have been partially processed by tmux.
    // When set-clipboard is enabled, tmux extracts the clipboard target (e.g., 'c')
    // for its own clipboard handling, but since it runs in a PTY without access
    // to the system clipboard, it outputs the sequence without the target:
    // ESC]52;;base64... instead of ESC]52;c;base64...
    // We restore the 'c' target for xterm.js ClipboardAddon to work.
    let processedText = text;
    if (processedText.includes('\x1b]52;;')) {
      processedText = processedText.replace(/\x1b\]52;;/g, '\x1b]52;c;');
    }

    // Parse OSC 633 sequences using extracted parser
    const { filteredOutput, sequences } = this.oscParser.parse(processedText);

    // Process OSC 633 sequences for block management
    for (const seq of sequences) {
      this.handleOSC633Sequence(seq);
    }

    // Count newlines to track current line
    for (const char of filteredOutput) {
      if (char === '\n') {
        this.currentLine++;
      }
    }

    // Create output message from filtered output (without OSC sequences)
    const filteredData = new TextEncoder().encode(filteredOutput);
    const message = createOutputMessage(filteredData);
    const serialized = serializeServerMessage(message);

    // Buffer for AI features using extracted broadcaster
    this.broadcaster.bufferOutput(message.data);

    // Append to active block if exists
    const activeBlockId = this.blockModel.getActiveBlockId();
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
          const activeBlockId = this.blockModel.getActiveBlockId();
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
   * Write string data to the PTY
   */
  writeString(data: string): void {
    // Filter out DA responses from xterm.js before writing to PTY
    // Create new RegExp instance to avoid global state race conditions
    const daPattern = new RegExp(CSI_DA_RESPONSE_PATTERN_STR, 'g');
    if (daPattern.test(data)) {
      const filtered = data.replace(new RegExp(CSI_DA_RESPONSE_PATTERN_STR, 'g'), '');
      if (!filtered) {
        return;
      }
      if (this.terminal && !this.terminal.closed) {
        this.terminal.write(filtered);
      }
      return;
    }
    if (this.terminal && !this.terminal.closed) {
      this.terminal.write(data);
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
    let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // Filter out focus events from xterm.js
    // Create new RegExp instances to avoid global state race conditions
    const focusPattern = new RegExp(FOCUS_EVENT_PATTERN_STR, 'g');
    if (focusPattern.test(text)) {
      text = text.replace(new RegExp(FOCUS_EVENT_PATTERN_STR, 'g'), '');
      if (!text) {
        return;
      }
    }

    // Filter out DA responses from xterm.js
    const daPattern = new RegExp(CSI_DA_RESPONSE_PATTERN_STR, 'g');
    if (daPattern.test(text)) {
      text = text.replace(new RegExp(CSI_DA_RESPONSE_PATTERN_STR, 'g'), '');
      if (!text) {
        return;
      }
    }

    // Workaround for first-character loss on mobile with CJK text
    // Send a space first to "wake up" the PTY, then send the actual text after a short delay
    // This prevents the first character from being lost in certain terminal environments
    // See ADR 054 for details
    const hasCJK = CJK_PATTERN.test(text);
    const isNewlineOnly = NEWLINE_ONLY_PATTERN.test(text);

    if (hasCJK && !isNewlineOnly) {
      // Send space to "wake up" the PTY
      this.terminal.write(' ');

      // Send actual text after short delay
      setTimeout(() => {
        if (this.terminal && !this.terminal.closed) {
          this.terminal.write(text);
        }
      }, 50);
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
  handleMessage(ws: NativeTerminalWebSocket, data: string): void {
    const message = parseClientMessage(data);
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
      clientCount: this.broadcaster.clientCount,
      startedAt: this.startedAt
    };
  }

  /**
   * Get buffered output for AI features
   */
  getOutputBuffer(): string[] {
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
  getBlocks(): Block[] {
    return this.blockModel.getAllBlocks();
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
  getActiveBlock(): Block | null {
    return this.blockModel.getActiveBlock();
  }

  /**
   * Enable or disable block UI
   */
  setBlockUIEnabled(enabled: boolean): void {
    this.blockUIEnabled = enabled;
  }

  /**
   * Check if block UI is enabled
   */
  isBlockUIEnabled(): boolean {
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
  }

  /**
   * Dispose the terminal session asynchronously.
   * Implements Symbol.asyncDispose for use with `await using` declarations.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
