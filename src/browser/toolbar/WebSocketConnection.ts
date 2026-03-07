/**
 * WebSocket Connection Manager
 *
 * Handles connection to terminal server via TerminalClient
 * and provides methods for sending text data.
 */

interface TerminalClient {
  isConnected: boolean;
  sendInput(data: string): void;
}

// Extend window type for native terminal
declare global {
  interface Window {
    __TERMINAL_CLIENT__?: TerminalClient;
  }
}

export class WebSocketConnection {
  /**
   * Check if connection is open
   */
  isConnected(): boolean {
    return window.__TERMINAL_CLIENT__?.isConnected ?? false;
  }

  /**
   * Send text to terminal via TerminalClient
   */
  sendText(text: string): boolean {
    const client = window.__TERMINAL_CLIENT__;
    if (!client || !client.isConnected) {
      return false;
    }
    client.sendInput(text);
    return true;
  }

  /**
   * Send raw bytes to terminal (converted to text)
   */
  sendBytes(bytes: number[]): boolean {
    const text = String.fromCharCode(...bytes);
    return this.sendText(text);
  }
}
