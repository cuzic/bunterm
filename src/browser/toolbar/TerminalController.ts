/**
 * Terminal Controller
 *
 * Provides methods for interacting with xterm.js terminal:
 * - Finding terminal instance
 * - Font size management
 * - Fit terminal to container
 * - Copy operations
 */

import { toolbarEvents } from '@/browser/shared/events.js';
import type { Terminal, TerminalUiConfig } from '@/browser/shared/types.js';
import { isMobileDevice } from '@/browser/shared/utils.js';
import type { ClipboardHistoryManager } from './ClipboardHistoryManager.js';
import type { InputHandler } from './InputHandler.js';

export class TerminalController {
  private config: TerminalUiConfig;
  private isMobile: boolean;
  private reinitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.isMobile = isMobileDevice();
  }

  /**
   * Get default font size based on device type
   */
  get defaultFontSize(): number {
    return this.isMobile ? this.config.font_size_default_mobile : this.config.font_size_default_pc;
  }

  /**
   * Find xterm.js terminal instance
   */
  findTerminal(): Terminal | null {
    if (window.term) {
      return window.term;
    }

    const termEl = document.querySelector('.xterm') as HTMLElement & { _core?: Terminal };
    if (termEl?._core) {
      return termEl._core;
    }

    return null;
  }

  /**
   * Fit terminal to container size
   */
  fitTerminal(): void {
    if (window.fitAddon && typeof window.fitAddon.fit === 'function') {
      window.fitAddon.fit();
      return;
    }

    const term = window.term as Terminal & { fitAddon?: { fit: () => void } };
    if (term?.fitAddon && typeof term.fitAddon.fit === 'function') {
      term.fitAddon.fit();
      return;
    }

    window.dispatchEvent(new Event('resize'));
  }

  /**
   * Get current font size
   */
  get currentFontSize(): number {
    const term = this.findTerminal();
    if (term?.options) {
      return term.options.fontSize ?? this.defaultFontSize;
    }
    return this.defaultFontSize;
  }

  /**
   * Set font size with bounds checking
   */
  setFontSize(size: number): boolean {
    const term = this.findTerminal();
    if (!term?.options) {
      return false;
    }

    const clampedSize = Math.max(
      this.config.font_size_min,
      Math.min(this.config.font_size_max, size)
    );

    term.options.fontSize = clampedSize;

    // Fit immediately
    this.fitTerminal();

    // On mobile, fit again after a short delay to ensure proper layout
    if (this.isMobile) {
      setTimeout(() => this.fitTerminal(), 50);
      setTimeout(() => this.fitTerminal(), 150);
    }

    // Debounced reinitialize after zoom settles
    this.scheduleReinit();

    return true;
  }

  /**
   * Zoom terminal font size by delta
   */
  zoomTerminal(delta: number): boolean {
    return this.setFontSize(this.currentFontSize + delta);
  }

  /**
   * Copy current selection to clipboard
   */
  copySelection(): Promise<boolean> {
    const term = this.findTerminal();
    if (!term) {
      return Promise.resolve(false);
    }

    const selection = term.getSelection();
    if (!selection) {
      return Promise.resolve(false);
    }

    return navigator.clipboard
      .writeText(selection)
      .then(() => {
        return true;
      })
      .catch((_err) => {
        return false;
      });
  }

  /**
   * Paste from clipboard to terminal
   */
  async paste(
    inputHandler: InputHandler,
    historyManager?: ClipboardHistoryManager
  ): Promise<boolean> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return false;
      }
      const result = inputHandler.sendText(text);
      if (result && historyManager) {
        historyManager.addToHistory(text);
      }
      return result;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Copy all terminal buffer content to clipboard
   */
  copyAll(): Promise<boolean> {
    const term = this.findTerminal();
    if (!term?.buffer?.active) {
      return Promise.resolve(false);
    }

    const buffer = term.buffer.active;
    const lines: string[] = [];

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }

    const text = lines.join('\n').trimEnd();

    return navigator.clipboard
      .writeText(text)
      .then(() => {
        return true;
      })
      .catch((_err) => {
        return false;
      });
  }

  /**
   * Scroll terminal by specified number of lines
   * Positive: scroll down (towards newer), Negative: scroll up (towards older)
   */
  scrollLines(amount: number): void {
    const term = this.findTerminal();
    if (term && typeof term.scrollLines === 'function') {
      term.scrollLines(amount);
    }
  }

  /**
   * Force terminal refresh/repaint
   * Useful when mobile browsers pause rendering during touch operations
   */
  refresh(): void {
    const term = this.findTerminal() as Terminal & { rows?: number };
    if (term && typeof term.refresh === 'function') {
      const rows = term.rows ?? 24;
      term.refresh(0, rows - 1);
    }
  }

  /**
   * Check if xterm.js has scrollback content beyond visible rows
   * Returns false if buffer length equals rows (e.g., when tmux manages buffer)
   */
  get hasScrollback(): boolean {
    const term = this.findTerminal() as Terminal & { rows?: number };
    if (!term?.buffer?.active) {
      return false;
    }
    const bufferLength = term.buffer.active.length;
    const rows = term.rows ?? 24;
    // If buffer length is greater than visible rows, we have scrollback
    return bufferLength > rows;
  }

  /**
   * Schedule a debounced reinitialize (300ms). Optionally run a callback after reinit.
   */
  scheduleReinit(afterReinit?: () => void): void {
    if (this.reinitTimer) clearTimeout(this.reinitTimer);
    this.reinitTimer = setTimeout(() => {
      this.reinitTimer = null;
      this.reinitialize();
      afterReinit?.();
    }, 300);
  }

  /**
   * Reinitialize terminal by disposing and recreating xterm.js instance.
   * This is useful for mobile browsers where the canvas/WebGL state gets corrupted
   * during toolbar toggle operations.
   *
   * Returns true if reinitialization was successful, false if terminal client not available.
   */
  reinitialize(): boolean {
    // This only works in native terminal mode where we have TerminalClient
    const terminalClient = window.__TERMINAL_CLIENT__ as
      | {
          reinitialize?: () => Promise<void>;
        }
      | undefined;

    if (!terminalClient?.reinitialize) {
      return false;
    }

    terminalClient.reinitialize();
    return true;
  }

  /**
   * Force page reload - fallback for when reinitialize doesn't fix rendering
   */
  forceReload(): void {
    location.reload();
  }

  /**
   * Setup visual bell handler
   */
  setupBellHandler(onBell?: () => void): void {
    const term = this.findTerminal();
    if (!term?.onBell) {
      // Retry later if terminal not ready
      setTimeout(() => this.setupBellHandler(onBell), 500);
      return;
    }

    term.onBell(() => {
      // Emit event via EventBus
      toolbarEvents.emit('notification:bell');

      // Call legacy callback if provided
      onBell?.();

      // Visual bell effect - flash the terminal
      const termEl = term.element;
      if (termEl) {
        termEl.classList.add('bell-flash');
        setTimeout(() => {
          termEl.classList.remove('bell-flash');
        }, 100);
      }
    });
  }
}
