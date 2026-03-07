/**
 * useTerminal Hook
 *
 * React hook for managing xterm.js terminal instance.
 */

import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';
import type { SerializeAddon } from '@xterm/addon-serialize';
import type { IDisposable, Terminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    XtermBundle: {
      createTerminal: (options?: {
        fontSize?: number;
        fontFamily?: string;
        scrollback?: number;
        cursorBlink?: boolean;
      }) => {
        terminal: Terminal;
        fitAddon: FitAddon;
        serializeAddon: SerializeAddon;
        searchAddon: SearchAddon;
        webLinksAddon: unknown;
        unicode11Addon: unknown;
        clipboardAddon: unknown;
      };
      setupSelectionAutoCopy?: (terminal: Terminal) => void;
      setupRightClickPaste?: (terminal: Terminal, sendInput: (data: string) => void) => void;
      setupSelectionHighlight?: (terminal: Terminal, searchAddon: SearchAddon) => IDisposable;
    };
  }
}

export interface UseTerminalOptions {
  wsUrl: string;
  fontSize?: number;
  fontFamily?: string;
  scrollback?: number;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  terminal: Terminal | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  fit: () => void;
  sendInput: (data: string) => void;
  serialize: () => string;
  focus: () => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const {
    wsUrl,
    fontSize = 14,
    fontFamily = 'Menlo, Monaco, "Courier New", monospace',
    scrollback = 10000,
    autoReconnect = true,
    reconnectDelay = 2000,
    maxReconnectAttempts = 5
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Send message to WebSocket
  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Encode input string to Base64 for binary-safe transmission
  // IMPORTANT: Do NOT use TextEncoder - it does UTF-8 encoding which corrupts
  // characters with code points > 127 (used in X10 mouse mode)
  const encodeInput = useCallback((data: string): string => {
    // Use btoa directly - it treats each character code point as a byte (Latin-1 encoding)
    try {
      return btoa(data);
    } catch {
      // Fallback for characters > 255 (shouldn't happen for terminal input)
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i) & 0xff;
      }
      return btoa(String.fromCharCode(...bytes));
    }
  }, []);

  // Send input to terminal
  const sendInput = useCallback(
    (data: string) => {
      send({ type: 'input', data: encodeInput(data) });
    },
    [send, encodeInput]
  );

  // Fit terminal to container
  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  // Get serialized terminal content
  const serialize = useCallback(() => {
    return serializeAddonRef.current?.serialize() ?? '';
  }, []);

  // Focus terminal
  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  // Start ping interval
  const startPing = useCallback(() => {
    pingIntervalRef.current = window.setInterval(() => {
      send({ type: 'ping' });
    }, 30000);
  }, [send]);

  // Stop ping interval
  const stopPing = useCallback(() => {
    if (pingIntervalRef.current !== null) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((data: string) => {
    try {
      const message = JSON.parse(data) as {
        type: string;
        data?: string;
        title?: string;
        code?: number;
        message?: string;
      };

      switch (message.type) {
        case 'output':
          if (message.data && terminalRef.current) {
            const bytes = Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0));
            const decoder = new TextDecoder('utf-8', { fatal: false });
            terminalRef.current.write(decoder.decode(bytes));
          }
          break;

        case 'title':
          if (message.title) {
            document.title = message.title;
          }
          break;

        case 'exit':
          terminalRef.current?.write(
            `\r\n\x1b[31m[Session exited with code ${message.code}]\x1b[0m\r\n`
          );
          break;

        case 'error':
          terminalRef.current?.write(`\r\n\x1b[31m[Error: ${message.message}]\x1b[0m\r\n`);
          break;

        case 'bell':
          terminalRef.current?.write('\x07');
          break;
      }
    } catch (err) {
      console.error('[useTerminal] Failed to parse message:', err);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!window.XtermBundle) {
      throw new Error('XtermBundle not loaded');
    }

    // Create terminal if not exists
    if (!terminalRef.current && containerRef.current) {
      const { terminal, fitAddon, serializeAddon, searchAddon } = window.XtermBundle.createTerminal(
        {
          fontSize,
          fontFamily,
          scrollback
        }
      );

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      serializeAddonRef.current = serializeAddon;

      terminal.open(containerRef.current);
      fitAddon.fit();

      // Setup auto-copy selection to clipboard on mouseup
      if (window.XtermBundle.setupSelectionAutoCopy) {
        window.XtermBundle.setupSelectionAutoCopy(terminal);
      }

      // Helper to encode input (Latin-1, not UTF-8)
      const encode = (data: string): string => {
        try {
          return btoa(data);
        } catch {
          const bytes = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) {
            bytes[i] = data.charCodeAt(i) & 0xff;
          }
          return btoa(String.fromCharCode(...bytes));
        }
      };

      // Setup right-click to paste from clipboard
      if (window.XtermBundle.setupRightClickPaste) {
        window.XtermBundle.setupRightClickPaste(terminal, (text) => {
          send({ type: 'input', data: encode(text) });
        });
      }

      // Setup selection highlight - highlight all occurrences of selected text
      if (window.XtermBundle.setupSelectionHighlight && searchAddon) {
        window.XtermBundle.setupSelectionHighlight(terminal, searchAddon);
      }

      // Handle terminal input (Base64 encode for binary safety)
      terminal.onData((data) => {
        send({ type: 'input', data: encode(data) });
      });

      // Handle binary input (for non-UTF-8 compatible sequences like X10 mouse mode)
      terminal.onBinary((data) => {
        send({ type: 'input', data: encode(data) });
      });

      // Handle terminal resize
      terminal.onResize(({ cols, rows }) => {
        send({ type: 'resize', cols, rows });
      });
    }

    return new Promise<void>((resolve, reject) => {
      setIsLoading(true);
      setError(null);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useTerminal] Connected');
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        setIsLoading(false);

        // Send initial resize
        if (terminalRef.current) {
          send({
            type: 'resize',
            cols: terminalRef.current.cols,
            rows: terminalRef.current.rows
          });
        }

        startPing();
        resolve();
      };

      ws.onmessage = (event) => {
        handleMessage(event.data);
      };

      ws.onerror = (event) => {
        console.error('[useTerminal] WebSocket error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = (event) => {
        console.log('[useTerminal] Disconnected:', event.code, event.reason);
        stopPing();
        setIsConnected(false);

        // Auto-reconnect
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = reconnectDelay * reconnectAttemptsRef.current;

          terminalRef.current?.write(
            `\r\n\x1b[33m[Reconnecting... attempt ${reconnectAttemptsRef.current}]\x1b[0m\r\n`
          );

          reconnectTimerRef.current = window.setTimeout(() => {
            connect().catch(console.error);
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          terminalRef.current?.write(
            '\r\n\x1b[31m[Connection lost - max reconnect attempts reached]\x1b[0m\r\n'
          );
          setError('Connection lost');
        }
      };
    });
  }, [
    wsUrl,
    fontSize,
    fontFamily,
    scrollback,
    autoReconnect,
    reconnectDelay,
    maxReconnectAttempts,
    send,
    startPing,
    stopPing,
    handleMessage
  ]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    stopPing();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, [stopPing]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => fit();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [disconnect]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    terminal: terminalRef.current,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    fit,
    sendInput,
    serialize,
    focus
  };
}
