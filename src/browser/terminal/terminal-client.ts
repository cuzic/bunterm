/**
 * Terminal Client - Browser-side WebSocket handler for native terminal sessions
 *
 * This module handles:
 * - WebSocket connection to the server
 * - xterm.js initialization and event handling
 * - Protocol message encoding/decoding
 * - Reconnection logic
 */

import type { Terminal as XtermTerminal } from '@xterm/xterm';
import { match, P } from 'ts-pattern';
import { toolbarEvents } from '@/browser/shared/events.js';
import { copyToClipboard } from '@/browser/shared/utils.js';
import { parseServerMessage } from '@/core/protocol/index.js';
import { type Block, BlockManager } from './BlockManager.js';
import { BlockRenderer } from './BlockRenderer.js';
import { ClaudeBlockManager } from './ClaudeBlockManager.js';
import { type BlockInfo, DecorationManager } from './DecorationManager.js';
import { FileOpsSidebar } from './FileOpsSidebar.js';
import { PathLinkManager } from './PathLinkManager.js';
import { fetchWebSocketErrorDetail, formatWebSocketConnectionError } from './ws-error-detail.js';

declare global {
  interface Window {
    XtermBundle: typeof import('./xterm-bundle.js') & {
      filterMouseSequences?: (data: string) => string;
      containsMouseSequence?: (data: string) => boolean;
    };
    TerminalClient: typeof TerminalClient;
    BlockManager: typeof BlockManager;
    BlockRenderer: typeof BlockRenderer;
    ClaudeBlockManager: typeof ClaudeBlockManager;
    DecorationManager: typeof DecorationManager;
    FileOpsSidebar: typeof FileOpsSidebar;
    PathLinkManager: typeof PathLinkManager;
    term: import('@xterm/xterm').Terminal | null;
    fitAddon: import('@xterm/addon-fit').FitAddon | null;
  }
}

interface TerminalClientOptions {
  /** WebSocket URL (e.g., ws://localhost:7680/bunterm/session/ws) */
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
  /** Enable path link detection (clicking on file paths shows actions) */
  enablePathLinks?: boolean;
  /**
   * Filter mouse reporting to PTY.
   * When true, mouse escape sequences are filtered out before sending to PTY.
   * This prevents garbage output when the shell doesn't handle mouse events.
   * Default: true (filter enabled)
   */
  filterMouseReporting?: boolean;
  /** Session name (for path link API calls) */
  sessionName?: string;
  /** Base path for API URLs (e.g., '/bunterm') */
  basePath?: string;
  /** Current working directory of the session */
  cwd?: string;
  /** Block UI event handlers */
  onBlockCopyCommand?: (command: string) => void;
  onBlockCopyOutput?: (output: string) => void;
  onBlockSendToAI?: (block: Block) => void;
}

interface ClientMessage {
  type: 'input' | 'resize' | 'ping' | 'watchFile' | 'unwatchFile' | 'watchDir' | 'unwatchDir';
  data?: string;
  cols?: number;
  rows?: number;
  path?: string;
}

// ServerMessage type is now imported from @/core/protocol/index.js

/**
 * Extended Terminal type with internal xterm.js APIs.
 * These are private APIs and may change between versions.
 */
interface TerminalWithCore extends XtermTerminal {
  _core?: {
    _renderService?: {
      dimensions?: {
        css?: {
          cell?: {
            width?: number;
            height?: number;
          };
        };
      };
    };
  };
}

export class TerminalClient implements Disposable {
  private ws: WebSocket | null = null;
  private terminal: import('@xterm/xterm').Terminal | null = null;
  private fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
  private serializeAddon: import('@xterm/addon-serialize').SerializeAddon | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private reinitTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: number | null = null;
  private isClosing = false;

  // Block UI
  private blockManager: BlockManager | null = null;
  private blockRenderer: BlockRenderer | null = null;

  // Claude Block UI
  private claudeBlockManager: ClaudeBlockManager | null = null;
  private decorationManager: DecorationManager | null = null;

  // Path link detection
  private pathLinkManager: PathLinkManager | null = null;

  // File operations sidebar
  private fileOpsSidebar: FileOpsSidebar | null = null;

  // File watcher callbacks
  private fileChangeListeners: Array<(path: string, timestamp: number) => void> = [];

  // Event listener cleanup stack
  private readonly eventListeners = new DisposableStack();

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
      enablePathLinks: true,
      filterMouseReporting: false, // Disabled by default - enable if shell shows garbage on mouse move
      sessionName: '',
      basePath: '/bunterm',
      cwd: '',
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

    // Setup multi-line link detection (URLs that wrap across lines)
    if (window.XtermBundle.registerMultiLineLinkProvider) {
      window.XtermBundle.registerMultiLineLinkProvider(terminal);
    }

    // Handle terminal input (UTF-8 text including IME input like Japanese)
    terminal.onData((data) => {
      let inputData = data;

      // Filter mouse sequences if enabled (prevents garbage when shell doesn't handle mouse)
      if (this.options.filterMouseReporting && window.XtermBundle.filterMouseSequences) {
        inputData = window.XtermBundle.filterMouseSequences(data);
        if (!inputData) {
          return; // All data was mouse sequences, nothing to send
        }
      }

      this.send({ type: 'input', data: this.encodeTextInput(inputData) });
    });

    // Handle binary input (for non-UTF-8 compatible sequences like X10 mouse mode)
    // xterm.js provides this separate event specifically for binary data
    terminal.onBinary((data) => {
      let inputData = data;

      // Filter mouse sequences if enabled (prevents garbage when shell doesn't handle mouse)
      if (this.options.filterMouseReporting && window.XtermBundle.filterMouseSequences) {
        inputData = window.XtermBundle.filterMouseSequences(data);
        if (!inputData) {
          return; // All data was mouse sequences, nothing to send
        }
      }

      this.send({ type: 'input', data: this.encodeBinaryInput(inputData) });
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', cols, rows });
    });

    // Handle window resize with 2-rAF scheduling for stable measurements
    // Using 2 requestAnimationFrame ensures layout is fully settled
    // (single rAF can still catch mid-layout values on some mobile browsers)
    let fitPending = 0;
    const scheduleFit = () => {
      fitPending++;
      const token = fitPending;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token !== fitPending) {
            return; // Superseded by newer request
          }
          this.fit();
          this.decorationManager?.handleResize();
        });
      });
    };

    // Register event listeners with automatic cleanup via DisposableStack
    // biome-ignore lint: cleaned up via disposables
    window.addEventListener('resize', scheduleFit, { passive: true });
    this.eventListeners.defer(() => window.removeEventListener('resize', scheduleFit));

    // Handle orientation change on mobile
    // biome-ignore lint: cleaned up via disposables
    window.addEventListener('orientationchange', scheduleFit, { passive: true });
    this.eventListeners.defer(() => window.removeEventListener('orientationchange', scheduleFit));

    // Handle Visual Viewport changes (mobile keyboard, address bar)
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const handleViewportResize = () => {
        scheduleFit();
        // Debounced reinit after keyboard show/hide settles
        if (this.reinitTimer) clearTimeout(this.reinitTimer);
        this.reinitTimer = setTimeout(() => {
          this.reinitTimer = null;
          this.reinitialize();
        }, 300);
      };
      // biome-ignore lint: cleaned up via disposables
      vv.addEventListener('resize', handleViewportResize, { passive: true });
      this.eventListeners.defer(() => vv.removeEventListener('resize', handleViewportResize));
      // biome-ignore lint: cleaned up via disposables
      vv.addEventListener('scroll', scheduleFit, { passive: true });
      this.eventListeners.defer(() => vv.removeEventListener('scroll', scheduleFit));
    }

    // Wait for fonts to load before fitting (font metrics can change)
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => scheduleFit());
    }

    // Initialize Path Link detection if enabled (must be before initBlockUI for FileOpsSidebar)
    if (this.options.enablePathLinks && this.options.sessionName && this.options.cwd) {
      this.initPathLinks();
    }

    // Initialize Block UI if enabled
    if (this.options.enableBlockUI) {
      this.initBlockUI();
    }

    // Connect to WebSocket
    await this.connectWebSocket();
  }

  /**
   * Initialize Path Link detection
   */
  private initPathLinks(): void {
    if (!this.terminal) {
      return;
    }

    this.pathLinkManager = new PathLinkManager({
      terminal: this.terminal,
      sessionName: this.options.sessionName,
      basePath: this.options.basePath,
      cwd: this.options.cwd
    });

    this.pathLinkManager.register();
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
          this.blockManager?.filter ?? 'all',
          this.blockManager?.getCounts() ?? { all: 0, success: 0, error: 0, running: 0 }
        );
      },
      onBlockEnd: (block) => {
        this.blockRenderer?.updateBlock(block);
        // Update filter counts when a block ends
        this.blockRenderer?.updateFilterState(
          this.blockManager?.filter ?? 'all',
          this.blockManager?.getCounts() ?? { all: 0, success: 0, error: 0, running: 0 }
        );
      },
      onBlocksLoaded: (blocks) => {
        this.blockRenderer?.renderBlocks(blocks);
        // Update filter counts after loading blocks
        this.blockRenderer?.updateFilterState(
          this.blockManager?.filter ?? 'all',
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
        onFilterBlock: (_blockId) => {},
        onRerunCommand: (command) => {
          // Send command to terminal with Enter
          this.sendInput(`${command}\n`);
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
          // Single click selects, Cmd/Ctrl+click handled in DecorationManager
          if (!event.metaKey && !event.ctrlKey) {
            this.decorationManager?.selectBlock(blockId);
            this.decorationManager?.scrollToBlock(blockId);
          }
        },
        onActionClick: (blockId, action, _event) => {
          this.handleDecorationAction(blockId, action);
        },
        onBlockSelect: (_blockId, _selected) => {}
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
        this.decorationManager?.updateStatus(turn.id, 'success');
      },
      onSessionStart: (_sessionId) => {},
      onSessionEnd: (_sessionId) => {
        // Clear file operations sidebar when session ends
        this.fileOpsSidebar?.clear();
      },
      onFileOperation: (filePath, toolName, turnId) => {
        // Add to file operations sidebar
        this.fileOpsSidebar?.addOperation({ filePath, toolName, turnId, status: 'pending' });
      },
      onFileOperationResult: (filePath, toolName, isError) => {
        // Update operation status in sidebar
        this.fileOpsSidebar?.updateOperationByPath(
          filePath,
          toolName,
          isError ? 'error' : 'complete'
        );
      }
    });

    // Initialize FileOpsSidebar (after PathLinkManager is set up)
    if (this.pathLinkManager) {
      this.fileOpsSidebar = new FileOpsSidebar({
        pathLinkManager: this.pathLinkManager,
        callbacks: {
          onVisibilityChange: () => {
            // Refit terminal when sidebar visibility changes
            requestAnimationFrame(() => this.fit());
          },
          onWidthChange: () => {
            // Refit terminal when sidebar width changes
            requestAnimationFrame(() => this.fit());
          }
        }
      });
    }
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
      }
      return;
    }

    // Otherwise it's a command block
    const block = this.blockManager?.getBlock(blockId);
    if (block) {
      switch (action) {
        case 'rerun':
          this.sendInput(`${block.command}\n`);
          break;
        case 'copy':
          this.options.onBlockCopyCommand?.(block.command);
          break;
        case 'ai': {
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
    const event = new CustomEvent('bunterm:add-context', {
      detail,
      bubbles: true
    });
    document.dispatchEvent(event);
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
      copyToClipboard(content);
    }
  }

  /**
   * Connect to the WebSocket server
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;

        // Reset xterm.js mouse tracking state on connect/reconnect.
        // This prevents "stuck" mouse tracking from previous sessions
        // (e.g., vim/tmux enabled mouse but the OFF sequence was never received).
        // Apps that need mouse will re-enable it when they start.
        this.resetMouseTracking();

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

      this.ws.onerror = (_error) => {
        // The WebSocket onerror event does not expose the HTTP status code or body.
        // Fetch the WS URL via HTTP to retrieve the rejection reason from the body.
        fetchWebSocketErrorDetail(this.options.wsUrl)
          .then((detail) => {
            reject(new Error(formatWebSocketConnectionError(detail)));
          })
          .catch(() => {
            reject(new Error('接続に失敗しました。サーバーが起動しているか確認してください。'));
          });
      };

      this.ws.onclose = (_event) => {
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
    const message = parseServerMessage(data);
    if (!message) {
      // Invalid message - silently ignore or log for debugging
      return;
    }

    try {
      match(message)
        .with({ type: 'output', data: P.string }, ({ data }) => {
          if (this.terminal) {
            const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
            const decoder = new TextDecoder('utf-8', { fatal: false });
            this.terminal.write(decoder.decode(bytes));
          }
        })
        .with({ type: 'title', title: P.string }, ({ title }) => {
          document.title = title;
        })
        .with({ type: 'exit' }, ({ code }) => {
          this.terminal?.write(`\r\n\x1b[31m[Session exited with code ${code}]\x1b[0m\r\n`);
        })
        .with({ type: 'pong' }, () => {
          // Keep-alive response
        })
        .with({ type: 'error' }, ({ message: msg }) => {
          this.terminal?.write(`\r\n\x1b[31m[Error: ${msg}]\x1b[0m\r\n`);
        })
        .with({ type: 'bell' }, () => {
          this.terminal?.write('\x07');
        })
        .with({ type: 'clipboard', text: P.string }, ({ text }) => {
          this.handleClipboardMessage(text);
        })
        .with({ type: 'fileChange', path: P.string }, ({ path, timestamp }) => {
          const ts = typeof timestamp === 'number' ? timestamp : Date.now();
          for (const listener of this.fileChangeListeners) {
            try {
              listener(path, ts);
            } catch {
              // Ignore listener errors
            }
          }
        })
        // Block UI messages
        .with({ type: 'blockStart', block: P.not(P.nullish) }, ({ block }) => {
          this.blockManager?.handleBlockStart(block);
          toolbarEvents.emit('block:start');
        })
        .with(
          {
            type: 'blockEnd',
            blockId: P.string,
            exitCode: P.number,
            endedAt: P.string,
            endLine: P.number
          },
          ({ blockId, exitCode, endedAt, endLine }) => {
            this.blockManager?.handleBlockEnd(blockId, exitCode, endedAt, endLine);
            toolbarEvents.emit('block:end');
          }
        )
        .with({ type: 'blockOutput', blockId: P.string, data: P.string }, ({ blockId, data }) => {
          this.blockManager?.handleBlockOutput(blockId, data);
        })
        .with({ type: 'blockList', blocks: P.array() }, ({ blocks }) => {
          this.blockManager?.handleBlockList(blocks);
        })
        // Claude Watcher messages
        .with(
          {
            type: P.union(
              'claudeUserMessage',
              'claudeAssistantText',
              'claudeThinking',
              'claudeToolUse',
              'claudeToolResult',
              'claudeSessionStart',
              'claudeSessionEnd'
            )
          },
          (msg) => {
            this.claudeBlockManager?.handleMessage(
              msg as Parameters<ClaudeBlockManager['handleMessage']>[0]
            );
            if (msg.type === 'claudeToolUse') {
              toolbarEvents.emit('claude:toolUse');
            } else if (msg.type === 'claudeSessionEnd') {
              toolbarEvents.emit('claude:sessionEnd');
            }
          }
        )
        // TODO: Replace with claude-watcher session count based redirect for agent teams
        .otherwise(() => {
          // Unknown message type - ignore
        });
    } catch (_error) {}
  }

  /**
   * Handle clipboard message from server — write text to system clipboard
   */
  private handleClipboardMessage(text: string): void {
    navigator.clipboard.writeText(text).then(
      () => {
        this.showClipboardToast('Copied to clipboard');
      },
      () => {
        // Clipboard API failed (no focus, permissions, or browser restriction)
        this.showClipboardToast('Click to copy', text);
      }
    );
  }

  /**
   * Show a clipboard toast notification
   */
  private showClipboardToast(message: string, fallbackText?: string): void {
    // Remove any existing toast
    const existing = document.getElementById('bunterm-clipboard-toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'bunterm-clipboard-toast';
    toast.style.cssText =
      'position:fixed;bottom:20px;right:20px;padding:8px 16px;' +
      'background:#333;color:#fff;border-radius:6px;font-size:13px;' +
      'z-index:10000;cursor:default;opacity:0;transition:opacity 0.2s;' +
      'font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3)';

    if (fallbackText !== undefined) {
      toast.textContent = message;
      toast.style.cursor = 'pointer';
      toast.addEventListener('click', () => {
        navigator.clipboard.writeText(fallbackText).then(
          () => {
            toast.textContent = 'Copied!';
            setTimeout(() => toast.remove(), 1000);
          },
          () => {
            toast.textContent = 'Copy failed';
            setTimeout(() => toast.remove(), 1500);
          }
        );
      });
    } else {
      toast.textContent = message;
    }

    document.body.appendChild(toast);
    // Trigger reflow for opacity transition
    toast.offsetHeight;
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
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
      this.terminal?.write(
        '\r\n\x1b[31m[Connection lost - max reconnect attempts reached]\x1b[0m\r\n'
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * this.reconnectAttempts;
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
   * Get container width in pixels, preferring integer values for stability.
   * Mobile browsers often return fractional values from getBoundingClientRect
   * which can cause subpixel rendering issues.
   */
  private getContainerWidthPx(): number {
    const container = this.options.container;

    // 1) clientWidth is always integer and most stable
    if (container.clientWidth > 0) {
      return container.clientWidth;
    }

    // 2) visualViewport can help, but make it integer
    const vv = window.visualViewport;
    if (vv?.width && vv.width > 0) {
      return Math.floor(vv.width);
    }

    // 3) fallback to getBoundingClientRect (may be fractional)
    const rect = container.getBoundingClientRect();
    return Math.floor(rect.width);
  }

  /**
   * Fit terminal to container with robust handling for mobile browsers.
   *
   * This implementation:
   * - Uses integer clientWidth to avoid subpixel issues
   * - Subtracts a small safety margin before calculating columns
   * - Detects overflow and auto-corrects by reducing columns
   */
  fit(): void {
    if (!this.fitAddon || !this.terminal) {
      return;
    }

    const isMobile = 'ontouchstart' in window || window.innerWidth <= 768;

    if (!isMobile) {
      // Desktop: FitAddon works reliably
      this.fitAddon.fit();
      return;
    }

    // Mobile: Use stable calculation with safety margin
    const SAFE_PX = 2; // Safety margin to prevent edge overflow

    // Get cell dimensions from xterm internal render service
    const termWithCore = this.terminal as TerminalWithCore;
    const cellWidth = termWithCore._core?._renderService?.dimensions?.css?.cell?.width;
    const cellHeight = termWithCore._core?._renderService?.dimensions?.css?.cell?.height;

    if (!cellWidth || !cellHeight) {
      // Fallback if we can't get cell dimensions
      this.fitAddon.fit();
      return;
    }

    const containerWidth = this.getContainerWidthPx();
    const containerHeight = this.options.container.clientHeight;

    // Calculate columns with safety margin subtracted BEFORE division
    const cols = Math.max(2, Math.floor((containerWidth - SAFE_PX) / cellWidth));
    const rows = Math.max(1, Math.floor(containerHeight / cellHeight));

    // Only resize if dimensions actually changed
    if (this.terminal.cols !== cols || this.terminal.rows !== rows) {
      this.terminal.resize(cols, rows);
    }

    // Overflow detection: if still overflowing, reduce by 1 more column
    requestAnimationFrame(() => {
      const termEl = this.terminal?.element;
      if (termEl) {
        const overflow = termEl.scrollWidth - termEl.clientWidth;
        if (overflow > 0 && this.terminal && this.terminal.cols > 2) {
          this.terminal.resize(this.terminal.cols - 1, this.terminal.rows);
        }
      }
    });
  }

  /**
   * Write data directly to the terminal (for local echo, etc.)
   */
  write(data: string): void {
    this.terminal?.write(data);
  }

  /**
   * Reset xterm.js mouse tracking state.
   * This sends escape sequences to disable all mouse tracking modes.
   * Call this on connect/reconnect to clear any "stuck" mouse tracking state
   * from previous sessions.
   *
   * Note: This doesn't break apps that need mouse - they will re-enable
   * tracking when they start (e.g., vim sends \x1b[?1006h on startup).
   */
  private resetMouseTracking(): void {
    if (!this.terminal) {
      return;
    }

    // Send mouse tracking OFF sequences to xterm.js
    // These are written to xterm.js (not PTY) to reset its internal state
    this.terminal.write(
      '\x1b[?1000l' + // X10 mouse off
        '\x1b[?1002l' + // Button-event tracking off
        '\x1b[?1003l' + // Any-event tracking off
        '\x1b[?1006l' + // SGR extended mouse mode off
        '\x1b[?1015l' // URXVT mouse mode off
    );
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
    const encoded = this.encodeTextInput(data);
    this.send({ type: 'input', data: encoded });
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
   * Reinitialize the terminal by disposing and recreating xterm.js instance.
   * This is useful for mobile browsers where the canvas/WebGL state gets corrupted
   * during toolbar toggle operations.
   *
   * The WebSocket connection is preserved - only the terminal UI is recreated.
   */
  async reinitialize(): Promise<void> {
    // Store current state
    const currentCols = this.terminal?.cols ?? 80;
    const currentRows = this.terminal?.rows ?? 24;
    const wasConnected = this.isConnected;

    // Cleanup block UI
    this.blockRenderer?.dispose();
    this.blockRenderer = null;
    // Don't clear blockManager - preserve block history

    // Cleanup decoration manager
    this.decorationManager?.dispose();
    this.decorationManager = null;

    // Cleanup path link manager
    this.pathLinkManager?.dispose();
    this.pathLinkManager = null;

    // Cleanup file operations sidebar (will be recreated with new pathLinkManager)
    this.fileOpsSidebar?.dispose();
    this.fileOpsSidebar = null;

    // Dispose terminal (but keep WebSocket open)
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
      window.term = null;
      window.fitAddon = null;
    }

    // Check if XtermBundle is available
    if (!window.XtermBundle) {
      throw new Error('XtermBundle not loaded');
    }

    // Create new terminal with addons
    const { terminal, fitAddon, serializeAddon, searchAddon } = window.XtermBundle.createTerminal({
      fontSize: this.options.fontSize,
      fontFamily: this.options.fontFamily,
      scrollback: this.options.scrollback
    });

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.serializeAddon = serializeAddon;

    // Expose to window for debugging and terminal-ui.js access
    window.term = terminal;
    window.fitAddon = fitAddon;

    // Clear container and re-open terminal
    this.options.container.innerHTML = '';
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

    // Setup selection highlight
    if (window.XtermBundle.setupSelectionHighlight && searchAddon) {
      window.XtermBundle.setupSelectionHighlight(terminal, searchAddon);
    }

    // Setup multi-line link detection (URLs that wrap across lines)
    if (window.XtermBundle.registerMultiLineLinkProvider) {
      window.XtermBundle.registerMultiLineLinkProvider(terminal);
    }

    // Handle terminal input
    terminal.onData((data) => {
      let inputData = data;
      if (this.options.filterMouseReporting && window.XtermBundle.filterMouseSequences) {
        inputData = window.XtermBundle.filterMouseSequences(data);
        if (!inputData) {
          return;
        }
      }
      this.send({ type: 'input', data: this.encodeTextInput(inputData) });
    });

    // Handle binary input
    terminal.onBinary((data) => {
      let inputData = data;
      if (this.options.filterMouseReporting && window.XtermBundle.filterMouseSequences) {
        inputData = window.XtermBundle.filterMouseSequences(data);
        if (!inputData) {
          return;
        }
      }
      this.send({ type: 'input', data: this.encodeBinaryInput(inputData) });
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', cols, rows });
    });

    // Reinitialize Block UI if it was enabled
    if (this.options.enableBlockUI && this.blockManager) {
      const terminalElement = this.options.container.querySelector('.xterm') as HTMLElement;
      if (terminalElement) {
        this.blockRenderer = new BlockRenderer({
          blockManager: this.blockManager,
          container: this.options.container,
          terminalElement,
          onCopyCommand: this.options.onBlockCopyCommand,
          onCopyOutput: this.options.onBlockCopyOutput,
          onSendToAI: this.options.onBlockSendToAI,
          onFilterBlock: (_blockId) => undefined,
          onRerunCommand: (command) => this.sendInput(`${command}\n`),
          onEditAndRerun: (command) => {
            this.sendInput(command);
            this.focus();
          }
        });
      }

      // Reinitialize DecorationManager
      this.decorationManager = new DecorationManager({
        terminal: this.terminal,
        onBlockClick: (blockId, event) => {
          if (!event.metaKey && !event.ctrlKey) {
            this.decorationManager?.selectBlock(blockId);
            this.decorationManager?.scrollToBlock(blockId);
          }
        },
        onActionClick: (blockId, action, _event) => {
          this.handleDecorationAction(blockId, action);
        },
        onBlockSelect: (_blockId, _selected) => undefined
      });
    }

    // Reinitialize Path Link Manager if enabled
    if (this.options.enablePathLinks && this.options.sessionName && this.options.cwd) {
      this.initPathLinks();

      // Reinitialize File Operations Sidebar with new pathLinkManager
      if (this.pathLinkManager) {
        this.fileOpsSidebar = new FileOpsSidebar({
          pathLinkManager: this.pathLinkManager,
          callbacks: {
            onVisibilityChange: () => requestAnimationFrame(() => this.fit()),
            onWidthChange: () => requestAnimationFrame(() => this.fit())
          }
        });
      }
    }

    // Reset mouse tracking state
    this.resetMouseTracking();

    // Send resize to match previous dimensions if connected
    if (wasConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: 'resize',
        cols: currentCols,
        rows: currentRows
      });

      // Request replay of buffered output to restore terminal content
      this.send({ type: 'replayRequest' });
    }
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

    // Cleanup all event listeners via DisposableStack
    this.eventListeners[Symbol.dispose]();

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

    // Cleanup path link manager
    this.pathLinkManager?.dispose();
    this.pathLinkManager = null;

    // Cleanup file operations sidebar
    this.fileOpsSidebar?.dispose();
    this.fileOpsSidebar = null;

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
    return this.blockManager?.allBlocks ?? [];
  }

  /**
   * Get the active (running) block
   */
  getActiveBlock(): Block | null {
    return this.blockManager?.activeBlock ?? null;
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

  /**
   * Update the current working directory (for path link resolution)
   */
  updateCwd(cwd: string): void {
    this.options.cwd = cwd;
    this.pathLinkManager?.updateCwd(cwd);
  }

  // === File Watcher API ===

  /**
   * Watch a file for changes
   * @param path File path relative to session directory
   */
  watchFile(path: string): void {
    this.send({ type: 'watchFile', path });
  }

  /**
   * Stop watching a file
   * @param path File path relative to session directory
   */
  unwatchFile(path: string): void {
    this.send({ type: 'unwatchFile', path });
  }

  /**
   * Watch a directory recursively for changes
   * @param path Directory path relative to session directory
   */
  watchDir(path: string): void {
    this.send({ type: 'watchDir', path });
  }

  /**
   * Stop watching a directory
   * @param path Directory path relative to session directory
   */
  unwatchDir(path: string): void {
    this.send({ type: 'unwatchDir', path });
  }

  /**
   * Register a file change listener
   * @param listener Callback function (path: string, timestamp: number) => void
   * @returns Function to unregister the listener
   */
  onFileChange(listener: (path: string, timestamp: number) => void): () => void {
    this.fileChangeListeners.push(listener);
    return () => {
      const index = this.fileChangeListeners.indexOf(listener);
      if (index !== -1) {
        this.fileChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Dispose the terminal client.
   * Implements Symbol.dispose for use with `using` declarations.
   */
  [Symbol.dispose](): void {
    this.disconnect();
  }
}

// Export for use by terminal-ui.js
window.TerminalClient = TerminalClient;
window.BlockManager = BlockManager;
window.BlockRenderer = BlockRenderer;
window.ClaudeBlockManager = ClaudeBlockManager;
window.DecorationManager = DecorationManager;
window.FileOpsSidebar = FileOpsSidebar;
window.PathLinkManager = PathLinkManager;
