/**
 * Terminal Client - Browser-side WebSocket handler for native terminal sessions
 *
 * This module handles:
 * - WebSocket connection to the server
 * - xterm.js initialization and event handling
 * - Protocol message encoding/decoding
 * - Reconnection logic
 */

declare global {
  interface Window {
    XtermBundle: typeof import('./xterm-bundle.js');
    TerminalClient: typeof TerminalClient;
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
}

interface ClientMessage {
  type: 'input' | 'resize' | 'ping';
  data?: string;
  cols?: number;
  rows?: number;
}

interface ServerMessage {
  type: 'output' | 'title' | 'exit' | 'pong' | 'error';
  data?: string;
  title?: string;
  code?: number;
  message?: string;
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

  private readonly options: Required<TerminalClientOptions>;

  constructor(options: TerminalClientOptions) {
    this.options = {
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      autoReconnect: true,
      reconnectDelay: 2000,
      maxReconnectAttempts: 5,
      ...options,
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
    const { terminal, fitAddon, serializeAddon } = window.XtermBundle.createTerminal({
      fontSize: this.options.fontSize,
      fontFamily: this.options.fontFamily,
      scrollback: this.options.scrollback,
    });

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.serializeAddon = serializeAddon;

    // Expose to window for debugging and terminal-ui.js access
    window.term = terminal;
    window.fitAddon = fitAddon;

    // Open terminal in container
    terminal.open(this.options.container);
    fitAddon.fit();

    // Handle terminal input
    terminal.onData((data) => {
      this.send({ type: 'input', data });
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      this.send({ type: 'resize', cols, rows });
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      this.fit();
    });

    // Connect to WebSocket
    await this.connectWebSocket();
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
            rows: this.terminal.rows,
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
      this.terminal?.write('\r\n\x1b[31m[Connection lost - max reconnect attempts reached]\x1b[0m\r\n');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * this.reconnectAttempts;

    console.log(`[TerminalClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.terminal?.write(`\r\n\x1b[33m[Reconnecting... attempt ${this.reconnectAttempts}]\x1b[0m\r\n`);

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
   * Send input to the server (for toolbar input)
   * This sends the input through the WebSocket to the PTY
   */
  sendInput(data: string): void {
    this.send({ type: 'input', data });
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
}

// Export for use by terminal-ui.js
window.TerminalClient = TerminalClient;
