/**
 * WebSocket Connection Manager
 *
 * Handles WebSocket connection to ttyd server and provides
 * methods for sending text and binary data.
 *
 * WebSocket interception is done early in <head> via inline script
 * to ensure we capture ttyd's WebSocket before it's created.
 * The captured WebSocket is stored in window.__TTYD_WS__.
 */

// Extend window type for captured WebSocket
declare global {
  interface Window {
    __TTYD_WS__?: WebSocket;
  }
}

export class WebSocketConnection {
  private ws: WebSocket | null = null;

  constructor() {
    // WebSocket interception is now done in <head> via inline script
    // Just retrieve the captured WebSocket
    this.ws = window.__TTYD_WS__ ?? null;
  }

  /**
   * Find active WebSocket connection
   */
  findWebSocket(): WebSocket | null {
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
    return this.findWebSocket() !== null;
  }

  /**
   * Send text to terminal
   * ttyd protocol: binary data with '0' (input command) as first byte
   */
  sendText(text: string): boolean {
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
   */
  sendBytes(bytes: number[]): boolean {
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
