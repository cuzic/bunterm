/**
 * TerminalSession - Manages a single PTY session using Bun.Terminal
 *
 * This class wraps Bun's built-in Terminal API to provide:
 * - PTY lifecycle management
 * - Multi-client broadcasting
 * - Output buffering for AI features
 * - WebSocket protocol handling
 */

import { BlockModel } from './block-model.js';
import {
  type Block,
  type NativeTerminalWebSocket,
  type ServerMessage,
  type TerminalSessionInfo,
  type TerminalSessionOptions,
  createBellMessage,
  createBlockEndMessage,
  createBlockListMessage,
  createBlockOutputMessage,
  createBlockStartMessage,
  createExitMessage,
  createOutputMessage,
  createPongMessage,
  parseClientMessage,
  serializeServerMessage
} from './types.js';

// Bell character (ASCII 7)
const BELL_CHAR = 0x07;

// OSC 633 control sequence markers
// Format: ESC ] 633 ; <type> [; <data>] BEL
// ESC = 0x1b, ] = 0x5d, BEL = 0x07
const OSC_START = '\x1b]633;';
const OSC_END = '\x07';

// OSC 633 sequence types
type OSC633Type = 'A' | 'B' | 'C' | 'D' | 'E' | 'P';

interface OSC633Sequence {
  type: OSC633Type;
  data?: string;
}

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

export class TerminalSession {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private terminal: BunTerminal | null = null;
  private clients: Set<NativeTerminalWebSocket> = new Set();
  private outputBuffer: string[] = [];
  private readonly maxOutputBuffer: number;
  private readonly startedAt: string;
  private currentCols: number;
  private currentRows: number;
  private exitCode: number | null = null;

  // Block UI state
  private readonly blockModel: BlockModel;
  private currentLine = 0;
  private pendingCommand: string | null = null;
  private blockUIEnabled = true;

  // OSC sequence buffer (for partial sequences across chunks)
  private oscBuffer = '';

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
    this.blockModel = new BlockModel(options.cwd);
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
        TTYD_MUX_NATIVE: '1'
      },
      terminal: {
        cols: this.currentCols,
        rows: this.currentRows,
        data: (_terminal: BunTerminal, data: Uint8Array) => {
          this.handleOutput(data);
        },
        exit: (_terminal: BunTerminal, code: number) => {
          console.log(`[TerminalSession:${this.name}] Terminal exit callback: ${code}`);
        }
      }
    });

    // Get terminal reference
    // biome-ignore lint/suspicious/noExplicitAny: Bun.Terminal type not fully exported
    this.terminal = (this.proc as any).terminal as BunTerminal;

    console.log(`[TerminalSession:${this.name}] Started PTY with PID: ${this.proc.pid}`);

    // Handle process exit
    this.proc.exited.then((code) => {
      console.log(`[TerminalSession:${this.name}] Process exited: code=${code}`);
      this.exitCode = code;
      this.broadcast(createExitMessage(code));
      this.cleanup();
    });
  }

  /**
   * Handle output data from PTY
   */
  private handleOutput(data: Uint8Array): void {
    // Check for bell character and send bell message
    if (data.includes(BELL_CHAR)) {
      this.broadcast(createBellMessage());
    }

    // Convert to string for OSC parsing
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data);

    // Parse OSC 633 sequences and get filtered output
    const { filteredOutput, sequences } = this.parseOSC633(text);

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

    // Buffer for AI features
    this.outputBuffer.push(message.data);
    if (this.outputBuffer.length > this.maxOutputBuffer) {
      this.outputBuffer.shift();
    }

    // Append to active block if exists
    const activeBlockId = this.blockModel.getActiveBlockId();
    if (activeBlockId && this.blockUIEnabled) {
      this.blockModel.appendOutput(activeBlockId, message.data);
      this.broadcast(createBlockOutputMessage(activeBlockId, message.data));
    }

    // Broadcast to all clients
    for (const ws of this.clients) {
      try {
        ws.send(serialized);
      } catch (error) {
        console.error(`[TerminalSession:${this.name}] Send error:`, error);
      }
    }
  }

  /**
   * Parse OSC 633 sequences from output text
   * Returns filtered output (without OSC sequences) and parsed sequences
   */
  private parseOSC633(text: string): { filteredOutput: string; sequences: OSC633Sequence[] } {
    const sequences: OSC633Sequence[] = [];
    let filteredOutput = '';
    let i = 0;

    // Add any pending OSC buffer from previous chunk
    const fullText = this.oscBuffer + text;
    this.oscBuffer = '';

    while (i < fullText.length) {
      // Look for OSC 633 start sequence
      if (fullText.slice(i).startsWith(OSC_START)) {
        const startIndex = i + OSC_START.length;
        const endIndex = fullText.indexOf(OSC_END, startIndex);

        if (endIndex === -1) {
          // Incomplete sequence, buffer it for next chunk
          this.oscBuffer = fullText.slice(i);
          break;
        }

        // Parse the sequence content
        const content = fullText.slice(startIndex, endIndex);
        const seq = this.parseOSC633Content(content);
        if (seq) {
          sequences.push(seq);
        }

        i = endIndex + OSC_END.length;
      } else {
        filteredOutput += fullText[i];
        i++;
      }
    }

    return { filteredOutput, sequences };
  }

  /**
   * Parse OSC 633 sequence content (after "633;")
   */
  private parseOSC633Content(content: string): OSC633Sequence | null {
    if (content.length === 0) return null;

    const type = content[0] as OSC633Type;
    const validTypes: OSC633Type[] = ['A', 'B', 'C', 'D', 'E', 'P'];

    if (!validTypes.includes(type)) return null;

    // Check for data after the type (separated by ";")
    const dataStart = content.indexOf(';');
    const data = dataStart !== -1 ? content.slice(dataStart + 1) : undefined;

    return { type, data };
  }

  /**
   * Handle an OSC 633 sequence for block management
   */
  private handleOSC633Sequence(seq: OSC633Sequence): void {
    if (!this.blockUIEnabled) return;

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
          this.broadcast(createBlockStartMessage(block));
          this.pendingCommand = null;
        }
        break;

      case 'D':
        // Command finished - end the current block
        {
          const exitCode = seq.data ? Number.parseInt(seq.data, 10) : 0;
          const activeBlockId = this.blockModel.getActiveBlockId();
          if (activeBlockId) {
            const endedAt = new Date().toISOString();
            this.blockModel.endBlock(activeBlockId, exitCode, this.currentLine);
            this.broadcast(
              createBlockEndMessage(activeBlockId, exitCode, endedAt, this.currentLine)
            );
          }
        }
        break;

      case 'E':
        // Explicit command line - store for 'C' sequence
        if (seq.data) {
          // Unescape the command
          this.pendingCommand = seq.data
            .replace(/\\n/g, '\n')
            .replace(/\\;/g, ';')
            .replace(/\\\\/g, '\\');
        }
        break;

      case 'P':
        // Property - handle Cwd
        if (seq.data?.startsWith('Cwd=')) {
          const cwd = seq.data.slice(4);
          this.blockModel.setCwd(cwd);
        }
        break;
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
    if (this.terminal && !this.terminal.closed) {
      this.terminal.write(data);
    }
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return;

    this.currentCols = cols;
    this.currentRows = rows;

    if (this.terminal && !this.terminal.closed && this.isRunning) {
      try {
        this.terminal.resize(cols, rows);
      } catch (error) {
        console.error(`[TerminalSession:${this.name}] Resize failed:`, error);
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

    // Send block list for reconnection
    if (this.blockUIEnabled) {
      const blocks = this.blockModel.getRecentBlocks(20);
      if (blocks.length > 0) {
        try {
          ws.send(serializeServerMessage(createBlockListMessage(blocks)));
        } catch {
          // Client may have disconnected
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
      startedAt: this.startedAt
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
      } catch {
        // Process may already be dead
      }
      this.proc = null;
      this.terminal = null;
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
