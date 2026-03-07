/**
 * Input Handler
 *
 * Handles keyboard input and special key sequences
 * for terminal interaction.
 */

import type { ModifierKeyState } from './ModifierKeyState.js';
import type { WebSocketConnection } from './WebSocketConnection.js';

export class InputHandler {
  private ws: WebSocketConnection;
  private modifiers: ModifierKeyState;

  constructor(ws: WebSocketConnection, modifiers: ModifierKeyState) {
    this.ws = ws;
    this.modifiers = modifiers;
  }

  /**
   * Send a key with modifier handling
   */
  sendKey(key: string): void {
    if (this.modifiers.isCtrlActive() && key.length === 1) {
      // Ctrl+key: send as control character (A=1, B=2, ..., Z=26)
      const code = key.toUpperCase().charCodeAt(0) - 64;
      if (code > 0 && code < 32) {
        this.ws.sendBytes([code]);
      }
      this.modifiers.resetCtrlAlt();
    } else if (this.modifiers.isAltActive() && key.length === 1) {
      // Alt+key: send ESC + key
      const keyCode = key.charCodeAt(0);
      this.ws.sendBytes([0x1b, keyCode]);
      this.modifiers.resetCtrlAlt();
    } else {
      this.ws.sendText(key);
    }
  }

  /**
   * Send Enter key (CR)
   */
  sendEnter(): void {
    this.ws.sendBytes([0x0d]);
  }

  /**
   * Send Escape key
   */
  sendEsc(): void {
    this.ws.sendBytes([0x1b]);
  }

  /**
   * Send Tab key
   */
  sendTab(): void {
    this.ws.sendBytes([0x09]);
  }

  /**
   * Send arrow key
   */
  sendArrow(direction: 'up' | 'down' | 'left' | 'right'): void {
    const codes: Record<string, number[]> = {
      up: [0x1b, 0x5b, 0x41], // ESC [ A
      down: [0x1b, 0x5b, 0x42], // ESC [ B
      right: [0x1b, 0x5b, 0x43], // ESC [ C
      left: [0x1b, 0x5b, 0x44] // ESC [ D
    };
    this.ws.sendBytes(codes[direction]);
  }

  /**
   * Send page up/down
   */
  sendPage(direction: 'up' | 'down'): void {
    if (direction === 'up') {
      this.ws.sendBytes([0x1b, 0x5b, 0x35, 0x7e]); // ESC [ 5 ~
    } else {
      this.ws.sendBytes([0x1b, 0x5b, 0x36, 0x7e]); // ESC [ 6 ~
    }
  }

  /**
   * Send text directly
   */
  sendText(text: string): boolean {
    return this.ws.sendText(text);
  }

  /**
   * Send mouse wheel event (SGR extended mode)
   * tmux with mouse mode expects: ESC [ < Cb ; Cx ; Cy M
   * @param direction - 'up' or 'down'
   * @param count - number of wheel ticks (default: 1)
   */
  sendWheel(direction: 'up' | 'down', count = 1): void {
    // SGR extended mouse mode: ESC [ < Cb ; Cx ; Cy M
    // For wheel events:
    // Wheel up: button code = 64 (0x40)
    // Wheel down: button code = 65 (0x41)
    const button = direction === 'up' ? 64 : 65;

    // Use coordinates near center of typical terminal
    // Coordinates are 1-based in SGR mode
    const x = 10;
    const y = 10;

    // Send both press (M) and release (m) for complete wheel event
    const pressSeq = `\x1b[<${button};${x};${y}M`;
    const releaseSeq = `\x1b[<${button};${x};${y}m`;

    for (let i = 0; i < count; i++) {
      // Send press event
      this.ws.sendText(pressSeq);
      // Send release event
      this.ws.sendText(releaseSeq);
    }
  }
}
