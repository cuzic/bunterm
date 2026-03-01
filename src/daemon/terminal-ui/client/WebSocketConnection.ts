/**
 * WebSocket Connection Manager
 *
 * Handles WebSocket connection to terminal server and provides
 * methods for sending text and binary data.
 *
 * Supports two modes:
 * 1. ttyd mode: WebSocket interception via window.__TTYD_WS__ with binary protocol
 * 2. Native mode: Uses TerminalClient via window.__TERMINAL_CLIENT__ with JSON protocol
 *
 * WebSocket interception (ttyd mode) is done early in <head> via inline script
 * to ensure we capture ttyd's WebSocket before it's created.
 */

interface TerminalClient {
  isConnected: boolean;
  sendInput(data: string): void;
}

// Extend window type for captured WebSocket and native terminal
declare global {
  interface Window {
    __TTYD_WS__?: WebSocket;
    __TERMINAL_CLIENT__?: TerminalClient;
    __TTYD_MUX_CONFIG__?: { isNativeTerminal?: boolean };
  }
}

export class WebSocketConnection {
  private ws: WebSocket | null = null;
  private isNativeMode: boolean;

  constructor() {
    // Check if we're in native terminal mode
    this.isNativeMode = window.__TTYD_MUX_CONFIG__?.isNativeTerminal ?? false;

    if (!this.isNativeMode) {
      // ttyd mode: WebSocket interception is done in <head> via inline script
      // Just retrieve the captured WebSocket
      this.ws = window.__TTYD_WS__ ?? null;
    }
  }

  /**
   * Check if we're in native terminal mode
   */
  isNative(): boolean {
    return this.isNativeMode;
  }

  /**
   * Find active WebSocket connection (ttyd mode only)
   */
  findWebSocket(): WebSocket | null {
    if (this.isNativeMode) {
      // Native mode doesn't expose WebSocket directly
      return null;
    }

    // First, check if we already have an open connection
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    // Try to get from captured WebSocket (set by inline script in <head>)
    if (window.__TTYD_WS__ && window.__TTYD_WS__.readyState === WebSocket.OPEN) {
      this.ws = window.__TTYD_WS__;
      return this.ws;
    }

    // Fallback: check window.socket (if ttyd exposes it)
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      this.ws = window.socket;
      return this.ws;
    }

    return null;
  }

  /**
   * Check if connection is open
   */
  isConnected(): boolean {
    if (this.isNativeMode) {
      return window.__TERMINAL_CLIENT__?.isConnected ?? false;
    }
    return this.findWebSocket() !== null;
  }

  /**
   * Send text to terminal
   * - Native mode: Uses TerminalClient.write() with JSON protocol
   * - ttyd mode: Binary data with '0' (input command) as first byte
   */
  sendText(text: string): boolean {
    if (this.isNativeMode) {
      const client = window.__TERMINAL_CLIENT__;
      if (!client || !client.isConnected) {
        return false;
      }
      client.sendInput(text);
      return true;
    }

    // ttyd mode
    const socket = this.findWebSocket();
    if (!socket) {
      return false;
    }

    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);
    const data = new Uint8Array(textBytes.length + 1);
    data[0] = 0x30; // '0' = input command
    data.set(textBytes, 1);
    socket.send(data);
    return true;
  }

  /**
   * Send raw bytes to terminal
   * Note: In native mode, bytes are converted to text
   */
  sendBytes(bytes: number[]): boolean {
    if (this.isNativeMode) {
      // Convert bytes to string for native mode
      const text = String.fromCharCode(...bytes);
      return this.sendText(text);
    }

    // ttyd mode
    const socket = this.findWebSocket();
    if (!socket) {
      return false;
    }

    const data = new Uint8Array(bytes.length + 1);
    data[0] = 0x30; // '0' = input command
    data.set(bytes, 1);
    socket.send(data);
    return true;
  }
}
