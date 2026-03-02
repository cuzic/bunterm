/**
 * Terminal Client - Browser-side WebSocket handler for native terminal sessions
 *
 * This module handles:
 * - WebSocket connection to the server
 * - xterm.js initialization and event handling
 * - Protocol message encoding/decoding
 * - Reconnection logic
 */

import { type Block, BlockManager } from './BlockManager.js';
import { BlockRenderer } from './BlockRenderer.js';
import { ClaudeBlockManager } from './ClaudeBlockManager.js';
import { DecorationManager, type BlockInfo } from './DecorationManager.js';

declare global {
  interface Window {
    XtermBundle: typeof import('./xterm-bundle.js');
    TerminalClient: typeof TerminalClient;
    BlockManager: typeof BlockManager;
    BlockRenderer: typeof BlockRenderer;
    ClaudeBlockManager: typeof ClaudeBlockManager;
    DecorationManager: typeof DecorationManager;
    term: import('@xterm/xterm').Terminal | null;
    fitAddon: import('@xterm/addon-fit').FitAddon | null;
  }
}

interface TerminalClientOptions {
  /** WebSocket URL (e.g., ws://localhost:7680/ttyd-mux/session/ws) */
  wsUrl: string;
  /** Container element for the terminal */
  container: HTMLElement;
  /** Font size */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Scrollback buffer size */
  scrollback?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
  /** Enable block UI */
  enableBlockUI?: boolean;
  /** Block UI event handlers */
  onBlockCopyCommand?: (command: string) => void;
  onBlockCopyOutput?: (output: string) => void;
  onBlockSendToAI?: (block: Block) => void;
}

interface ClientMessage {
  type: 'input' | 'resize' | 'ping';
  data?: string;
  cols?: number;
  rows?: number;
}

interface ServerMessage {
  type:
    | 'output'
    | 'title'
    | 'exit'
    | 'pong'
    | 'error'
    | 'bell'
    | 'blockStart'
    | 'blockEnd'
    | 'blockOutput'
    | 'blockList'
    // Claude watcher messages
    | 'claudeUserMessage'
    | 'claudeAssistantText'
    | 'claudeThinking'
    | 'claudeToolUse'
    | 'claudeToolResult'
    | 'claudeSessionStart'
    | 'claudeSessionEnd';
  data?: string;
  title?: string;
  code?: number;
  message?: string;
  // Block-related fields
  block?: Block;
  blockId?: string;
  exitCode?: number;
  endedAt?: string;
  endLine?: number;
  blocks?: Block[];
  // Claude-related fields
  uuid?: string;
  content?: string;
  text?: string;
  thinking?: string;
  toolId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  isError?: boolean;
  sessionId?: string;
  project?: string;
  timestamp?: string;
}

export class TerminalClient {
  private ws: WebSocket | null = null;
  private terminal: import('@xterm/xterm').Terminal | null = null;
  private fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
  private serializeAddon: import('@xterm/addon-serialize').SerializeAddon | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private isClosing = false;

  // Block UI
  private blockManager: BlockManager | null = null;
  private blockRenderer: BlockRenderer | null = null;

  // Claude Block UI
  private claudeBlockManager: ClaudeBlockManager | null = null;
  private decorationManager: DecorationManager | null = null;

  private readonly options: Required<TerminalClientOptions>;

  constructor(options: TerminalClientOptions) {
    this.options = {
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      autoReconnect: true,
      reconnectDelay: 2000,
      maxReconnectAttempts: 5,
      enableBlockUI: true,
      onBlockCopyCommand: undefined as unknown as (command: string) => void,
      onBlockCopyOutput: undefined as unknown as (output: string) => void,
      onBlockSendToAI: undefined as unknown as (block: Block) => void,
      ...options
    };
  }

  /**
   * Initialize the terminal and connect to the server
   */
  async connect(): Promise<void> {
    // Check if XtermBundle is available
    if (!window.XtermBundle) {
      throw new Error('XtermBundle not loaded');
    }

    // Create terminal with addons
    const { terminal, fitAddon, serializeAddon, searchAddon } = window.XtermBundle.createTerminal({
      fontSize: this.options.fontSize,
      fontFamily: this.options.fontFamily,
      scrollback: this.options.scrollback
    });

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.serializeAddon = serializeAddon;
    const searchAddonRef = searchAddon;

    // Expose to window for debugging and terminal-ui.js access
    window.term = terminal;
    window.fitAddon = fitAddon;

    // Open terminal in container
    terminal.open(this.options.container);
    fitAddon.fit();

    // Setup auto-copy selection to clipboard on mouseup
    if (window.XtermBundle.setupSelectionAutoCopy) {
      window.XtermBundle.setupSelectionAutoCopy(terminal);
    }

    // Setup right-click to paste from clipboard
    if (window.XtermBundle.setupRightClickPaste) {
      window.XtermBundle.setupRightClickPaste(terminal, (text) => {
        this.send({ type: 'input', data: this.encodeTextInput(text) });
      });
    }

    // Setup selection highlight - highlight all occurrences of selected text
    if (window.XtermBundle.setupSelectionHighlight && searchAddonRef) {
      window.XtermBundle.setupSelectionHighlight(terminal, searchAddonRef);
    }

    // Handle terminal input (UTF-8 text including IME input like Japanese)
    terminal.onData((data) => {
      this.send({ type: 'input', data: this.encodeTextInput(data) });
    });

    // Handle binary input (for non-UTF-8 compatible sequences like X10 mouse mode)
    // xterm.js provides this separate event specifically for binary data
    terminal.onBinary((data) => {
      this.send({ type: 'input', data: this.encodeBinaryInput(data) });
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', cols, rows });
    });

    // Handle window resize with debouncing
    let resizeTimeout: number | null = null;
    const debouncedFit = () => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(() => {
        this.fit();
        // Update decoration positions after resize
        this.decorationManager?.handleResize();
        resizeTimeout = null;
      }, 50);
    };

    window.addEventListener('resize', debouncedFit);

    // Handle orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(debouncedFit, 100);
    });

    // Handle Visual Viewport changes (mobile keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', debouncedFit);
      window.visualViewport.addEventListener('scroll', debouncedFit);
    }

    // Initialize Block UI if enabled
    if (this.options.enableBlockUI) {
      this.initBlockUI();
    }

    // Connect to WebSocket
    await this.connectWebSocket();
  }

  /**
   * Initialize the Block UI components
   */
  private initBlockUI(): void {
    // Create BlockManager with event handlers
    this.blockManager = new BlockManager({
      onBlockStart: (block) => {
        this.blockRenderer?.addBlock(block);
        // Update filter counts when a new block starts
        this.blockRenderer?.updateFilterState(
          this.blockManager?.getFilter() ?? 'all',
          this.blockManager?.getCounts() ?? { all: 0, success: 0, error: 0, running: 0 }
        );
      },
      onBlockEnd: (block) => {
        this.blockRenderer?.updateBlock(block);
        // Update filter counts when a block ends
        this.blockRenderer?.updateFilterState(
          this.blockManager?.getFilter() ?? 'all',
          this.blockManager?.getCounts() ?? { all: 0, success: 0, error: 0, running: 0 }
        );
      },
      onBlocksLoaded: (blocks) => {
        this.blockRenderer?.renderBlocks(blocks);
        // Update filter counts after loading blocks
        this.blockRenderer?.updateFilterState(
          this.blockManager?.getFilter() ?? 'all',
          this.blockManager?.getCounts() ?? { all: 0, success: 0, error: 0, running: 0 }
        );
      },
      onSelectionChange: (selectedIds) => {
        this.blockRenderer?.updateSelectionState(selectedIds);
      },
      onFilterChange: (filter, counts) => {
        this.blockRenderer?.updateFilterState(filter, counts);
      },
      onFocusChange: (blockId) => {
        this.blockRenderer?.updateFocusState(blockId);
      }
    });

    // Create BlockRenderer
    const terminalElement = this.options.container.querySelector('.xterm') as HTMLElement;
    if (terminalElement) {
      this.blockRenderer = new BlockRenderer({
        blockManager: this.blockManager,
        container: this.options.container,
        terminalElement,
        onCopyCommand: this.options.onBlockCopyCommand,
        onCopyOutput: this.options.onBlockCopyOutput,
        onSendToAI: this.options.onBlockSendToAI,
        onFilterBlock: (blockId) => {
          // Filter/search within block - can be implemented later
          console.log('[BlockUI] Filter in block:', blockId);
        },
        onRerunCommand: (command) => {
          // Send command to terminal with Enter
          this.sendInput(command + '\n');
        },
        onEditAndRerun: (command) => {
          // Send command to terminal without Enter (for editing)
          this.sendInput(command);
          this.focus();
        }
      });
    }

    // Initialize DecorationManager for xterm.js decorations
    if (this.terminal) {
      this.decorationManager = new DecorationManager({
        terminal: this.terminal,
        onBlockClick: (blockId, event) => {
          console.log('[DecorationManager] Block clicked:', blockId);
          // Single click selects, Cmd/Ctrl+click handled in DecorationManager
          if (!event.metaKey && !event.ctrlKey) {
            this.decorationManager?.selectBlock(blockId);
            this.decorationManager?.scrollToBlock(blockId);
          }
        },
        onActionClick: (blockId, action, _event) => {
          console.log('[DecorationManager] Action clicked:', blockId, action);
          this.handleDecorationAction(blockId, action);
        },
        onBlockSelect: (blockId, selected) => {
          console.log('[DecorationManager] Block selection changed:', blockId, selected);
        }
      });

      // Add keyboard handler for block operations
      this.terminal.attachCustomKeyEventHandler((event) => {
        // Cmd/Ctrl+C with selection copies selected blocks
        if ((event.metaKey || event.ctrlKey) && event.key === 'c' && event.type === 'keydown') {
          const selectedIds = this.decorationManager?.getSelectedBlockIds() ?? [];
          if (selectedIds.length > 0) {
            this.copySelectedBlocks(selectedIds);
            return false; // Prevent default terminal handling
          }
        }
        // Escape clears selection
        if (event.key === 'Escape' && event.type === 'keydown') {
          this.decorationManager?.clearSelection();
        }
        return true; // Allow default handling
      });
    }

    // Initialize ClaudeBlockManager
    this.claudeBlockManager = new ClaudeBlockManager({
      onTurnStart: (turn) => {
        console.log('[ClaudeBlockManager] Turn started:', turn.id);
        // Add decoration for new Claude turn
        if (this.decorationManager && this.terminal) {
          const blockInfo: BlockInfo = {
            id: turn.id,
            type: 'claude',
            status: 'streaming',
            startLine: this.terminal.buffer.active.cursorY,
            userMessage: turn.userMessage
          };
          this.decorationManager.addBlock(blockInfo);
        }
      },
      onTurnUpdate: (turn) => {
        // Update decoration status if needed
        if (turn.status === 'streaming') {
          this.decorationManager?.updateStatus(turn.id, 'streaming');
        }
      },
      onTurnComplete: (turn) => {
        console.log('[ClaudeBlockManager] Turn completed:', turn.id);
        this.decorationManager?.updateStatus(turn.id, 'success');
      },
      onSessionStart: (sessionId) => {
        console.log('[ClaudeBlockManager] Session started:', sessionId);
      },
      onSessionEnd: (sessionId) => {
        console.log('[ClaudeBlockManager] Session ended:', sessionId);
      }
    });
  }

  /**
   * Handle decoration action button clicks
   */
  private handleDecorationAction(blockId: string, action: string): void {
    // Check if it's a Claude turn
    const claudeTurn = this.claudeBlockManager?.getTurn(blockId);
    if (claudeTurn) {
      switch (action) {
        case 'copy':
          navigator.clipboard.writeText(this.claudeBlockManager?.formatTurnForCopy(blockId) ?? '');
          break;
        case 'context':
          // Add Claude turn to AI Chat context via custom event
          this.dispatchBlockContextEvent({
            type: 'claude',
            blockId,
            content: this.claudeBlockManager?.formatTurnAsMarkdown(blockId) ?? '',
            metadata: {
              userMessage: claudeTurn.userMessage,
              assistantText: claudeTurn.assistantText,
              toolCallCount: claudeTurn.toolCalls.length
            }
          });
          break;
        case 'search':
          // Search within turn - open search panel with turn content
          console.log('[DecorationManager] Search in Claude turn:', blockId);
          break;
      }
      return;
    }

    // Otherwise it's a command block
    const block = this.blockManager?.getBlock(blockId);
    if (block) {
      switch (action) {
        case 'rerun':
          this.sendInput(block.command + '\n');
          break;
        case 'copy':
          this.options.onBlockCopyCommand?.(block.command);
          break;
        case 'ai':
          // Add command block to AI Chat context via custom event
          this.dispatchBlockContextEvent({
            type: 'command',
            blockId,
            content: `$ ${block.command}\n${atob(block.output)}`,
            metadata: {
              command: block.command,
              exitCode: block.exitCode,
              status: block.status
            }
          });
          this.options.onBlockSendToAI?.(block);
          break;
      }
    }
  }

  /**
   * Dispatch custom event for adding block to AI context
   */
  private dispatchBlockContextEvent(detail: {
    type: 'command' | 'claude';
    blockId: string;
    content: string;
    metadata: Record<string, unknown>;
  }): void {
    const event = new CustomEvent('ttyd-mux:add-context', {
      detail,
      bubbles: true
    });
    document.dispatchEvent(event);
    console.log('[TerminalClient] Dispatched add-context event:', detail.blockId);
  }

  /**
   * Copy selected blocks to clipboard
   */
  private copySelectedBlocks(blockIds: string[]): void {
    const texts: string[] = [];

    for (const blockId of blockIds) {
      // Try Claude turn first
      const claudeTurn = this.claudeBlockManager?.getTurn(blockId);
      if (claudeTurn) {
        texts.push(this.claudeBlockManager?.formatTurnForCopy(blockId) ?? '');
        continue;
      }

      // Otherwise try command block
      const block = this.blockManager?.getBlock(blockId);
      if (block) {
        const output = atob(block.output);
        texts.push(`$ ${block.command}\n${output}`);
      }
    }

    if (texts.length > 0) {
      const content = texts.join('\n\n---\n\n');
      navigator.clipboard.writeText(content).then(() => {
        console.log('[TerminalClient] Copied', blockIds.length, 'blocks to clipboard');
      });
    }
  }

  /**
   * Connect to the WebSocket server
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.wsUrl);

      this.ws.onopen = () => {
        console.log('[TerminalClient] Connected');
        this.reconnectAttempts = 0;

        // Send initial resize
        if (this.terminal) {
          this.send({
            type: 'resize',
            cols: this.terminal.cols,
            rows: this.terminal.rows
          });
        }

        // Start ping interval
        this.startPing();

        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[TerminalClient] WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('[TerminalClient] Disconnected:', event.code, event.reason);
        this.stopPing();

        if (!this.isClosing && this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  /**
   * Handle incoming server messages
   */
  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      switch (message.type) {
        case 'output':
          if (message.data && this.terminal) {
            // Decode Base64 data
            const bytes = Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0));
            const decoder = new TextDecoder('utf-8', { fatal: false });
            this.terminal.write(decoder.decode(bytes));
          }
          break;

        case 'title':
          if (message.title) {
            document.title = message.title;
          }
          break;

        case 'exit':
          console.log('[TerminalClient] Session exited with code:', message.code);
          this.terminal?.write(`\r\n\x1b[31m[Session exited with code ${message.code}]\x1b[0m\r\n`);
          break;

        case 'pong':
          // Keep-alive response
          break;

        case 'error':
          console.error('[TerminalClient] Server error:', message.message);
          this.terminal?.write(`\r\n\x1b[31m[Error: ${message.message}]\x1b[0m\r\n`);
          break;

        case 'bell':
          // Trigger xterm.js bell (plays sound if configured, triggers onBell handlers)
          if (this.terminal) {
            // Write bell character to trigger xterm.js bell event
            this.terminal.write('\x07');
          }
          break;

        // Block UI messages
        case 'blockStart':
          if (message.block) {
            this.blockManager?.handleBlockStart(message.block);
          }
          break;

        case 'blockEnd':
          if (
            message.blockId &&
            message.exitCode !== undefined &&
            message.endedAt &&
            message.endLine !== undefined
          ) {
            this.blockManager?.handleBlockEnd(
              message.blockId,
              message.exitCode,
              message.endedAt,
              message.endLine
            );
          }
          break;

        case 'blockOutput':
          if (message.blockId && message.data) {
            this.blockManager?.handleBlockOutput(message.blockId, message.data);
          }
          break;

        case 'blockList':
          if (message.blocks) {
            this.blockManager?.handleBlockList(message.blocks);
          }
          break;

        // Claude Watcher messages
        case 'claudeUserMessage':
        case 'claudeAssistantText':
        case 'claudeThinking':
        case 'claudeToolUse':
        case 'claudeToolResult':
        case 'claudeSessionStart':
        case 'claudeSessionEnd':
          this.claudeBlockManager?.handleMessage(message as Parameters<ClaudeBlockManager['handleMessage']>[0]);
          break;
      }
    } catch (error) {
      console.error('[TerminalClient] Failed to parse message:', error);
    }
  }

  /**
   * Send a message to the server
   */
  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start ping interval for keep-alive
   */
  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[TerminalClient] Max reconnect attempts reached');
      this.terminal?.write(
        '\r\n\x1b[31m[Connection lost - max reconnect attempts reached]\x1b[0m\r\n'
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * this.reconnectAttempts;

    console.log(`[TerminalClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.terminal?.write(
      `\r\n\x1b[33m[Reconnecting... attempt ${this.reconnectAttempts}]\x1b[0m\r\n`
    );

    this.reconnectTimer = window.setTimeout(async () => {
      try {
        await this.connectWebSocket();
      } catch {
        // Will trigger onclose and schedule another reconnect
      }
    }, delay);
  }

  /**
   * Fit terminal to container
   */
  fit(): void {
    this.fitAddon?.fit();
  }

  /**
   * Write data directly to the terminal (for local echo, etc.)
   */
  write(data: string): void {
    this.terminal?.write(data);
  }

  /**
   * Encode text input (UTF-8) to Base64 for transmission.
   * Used for keyboard text input including IME (Japanese, Chinese, etc.)
   */
  private encodeTextInput(data: string): string {
    // Use TextEncoder for proper UTF-8 encoding of multi-byte characters
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    // Convert Uint8Array to Base64 using spread to avoid undefined issues
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Encode binary input to Base64 for transmission.
   * Used for terminal escape sequences (mouse X10 mode, etc.) where each
   * character code point should be treated as a single byte.
   *
   * IMPORTANT: Do NOT use TextEncoder here! TextEncoder does UTF-8 encoding,
   * which converts characters with code points > 127 to multi-byte sequences.
   *
   * Example: X10 mouse at position (100, 50) sends character code 132 (100+32).
   * - TextEncoder: 132 -> 0xC2 0x84 (2 bytes, WRONG!)
   * - charCodeAt:  132 -> 0x84 (1 byte, CORRECT!)
   */
  private encodeBinaryInput(data: string): string {
    // Each character code point is treated as a single byte (Latin-1 style)
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      bytes[i] = data.charCodeAt(i) & 0xff;
    }
    // Convert Uint8Array to Base64 using spread to avoid undefined issues
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Send input to the server (for toolbar input)
   * This sends the input through the WebSocket to the PTY
   */
  sendInput(data: string): void {
    this.send({ type: 'input', data: this.encodeTextInput(data) });
  }

  /**
   * Get serialized terminal content (for AI features)
   */
  serialize(): string {
    return this.serializeAddon?.serialize() ?? '';
  }

  /**
   * Focus the terminal
   */
  focus(): void {
    this.terminal?.focus();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.isClosing = true;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPing();

    // Cleanup block UI
    this.blockRenderer?.dispose();
    this.blockRenderer = null;
    this.blockManager?.clear();
    this.blockManager = null;

    // Cleanup Claude block UI
    this.decorationManager?.dispose();
    this.decorationManager = null;
    this.claudeBlockManager?.clear();
    this.claudeBlockManager = null;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }

    window.term = null;
    window.fitAddon = null;
  }

  /**
   * Get the terminal instance
   */
  get term(): import('@xterm/xterm').Terminal | null {
    return this.terminal;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get all blocks
   */
  getBlocks(): Block[] {
    return this.blockManager?.getAllBlocks() ?? [];
  }

  /**
   * Get the active (running) block
   */
  getActiveBlock(): Block | null {
    return this.blockManager?.getActiveBlock() ?? null;
  }

  /**
   * Toggle block UI visibility
   */
  toggleBlockUI(): void {
    this.blockRenderer?.toggle();
  }

  /**
   * Show/hide block UI
   */
  setBlockUIVisible(visible: boolean): void {
    this.blockRenderer?.setVisible(visible);
  }

  /**
   * Get decoded output for a specific block
   */
  getBlockOutput(blockId: string): string {
    return this.blockManager?.getDecodedOutput(blockId) ?? '';
  }
}

// Export for use by terminal-ui.js
window.TerminalClient = TerminalClient;
window.BlockManager = BlockManager;
window.BlockRenderer = BlockRenderer;
window.ClaudeBlockManager = ClaudeBlockManager;
window.DecorationManager = DecorationManager;
