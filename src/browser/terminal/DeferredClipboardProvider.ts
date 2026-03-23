/**
 * DeferredClipboardProvider - Handle OSC 52 clipboard operations with browser security workaround
 *
 * Browser security requires a user gesture (click, keypress) for clipboard writes.
 * When OSC 52 arrives without a user gesture, this provider:
 * 1. Stores the pending clipboard text
 * 2. Shows a notification that text is ready to copy
 * 3. Copies to clipboard on the next user interaction
 */

import type { ClipboardSelectionType, IClipboardProvider } from '@xterm/addon-clipboard';

export interface DeferredClipboardOptions {
  /** Callback when clipboard write fails and text is deferred */
  onDeferred?: (text: string) => void;
  /** Callback when deferred text is successfully copied */
  onCopied?: (text: string) => void;
  /** Auto-retry on focus (default: true) */
  autoRetryOnFocus?: boolean;
}

export class DeferredClipboardProvider implements IClipboardProvider {
  private pendingText: string | null = null;
  private readonly options: DeferredClipboardOptions;

  constructor(options: DeferredClipboardOptions = {}) {
    this.options = {
      autoRetryOnFocus: true,
      ...options
    };

    // Try to copy on focus (user activation context)
    if (this.options.autoRetryOnFocus) {
      // biome-ignore lint: cleaned up in dispose() via removeEventListener
      window.addEventListener('focus', this.handleFocus);
    }
  }

  private handleFocus = (): void => {
    // Focus event itself is a user activation
    this.flushPending();
  };

  /**
   * Get pending text that couldn't be copied
   */
  public getPendingText(): string | null {
    return this.pendingText;
  }

  /**
   * Check if there's pending text waiting for user gesture
   */
  public hasPending(): boolean {
    return this.pendingText !== null;
  }

  /**
   * Clear pending text without copying
   */
  public clearPending(): void {
    this.pendingText = null;
  }

  /**
   * Manually flush pending text (call from user gesture handler)
   */
  public async flushPending(): Promise<boolean> {
    if (!this.pendingText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(this.pendingText);
      const copied = this.pendingText;
      this.pendingText = null;
      this.options.onCopied?.(copied);
      return true;
    } catch {
      // Still blocked, keep pending
      return false;
    }
  }

  /**
   * Register a one-time user gesture handler to copy pending text
   */
  public registerGestureHandler(element: HTMLElement): () => void {
    const handler = () => {
      this.flushPending();
      cleanup();
    };

    const cleanup = () => {
      element.removeEventListener('click', handler);
      element.removeEventListener('keydown', handler);
    };

    // biome-ignore lint: { once: true } auto-removes listener after first invocation
    element.addEventListener('click', handler, { once: true });
    // biome-ignore lint: { once: true } auto-removes listener after first invocation
    element.addEventListener('keydown', handler, { once: true });

    return cleanup;
  }

  public async readText(selection: ClipboardSelectionType): Promise<string> {
    if (selection !== 'c') {
      return '';
    }
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }

  public async writeText(selection: ClipboardSelectionType, text: string): Promise<void> {
    if (selection !== 'c') {
      return;
    }

    try {
      // Try direct clipboard write
      await navigator.clipboard.writeText(text);
      this.options.onCopied?.(text);
    } catch {
      // Browser blocked clipboard write (no user gesture)
      // Store for deferred copy
      this.pendingText = text;
      this.options.onDeferred?.(text);

      // Try fallback: execCommand (deprecated but might work in some contexts)
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
          this.pendingText = null;
          this.options.onCopied?.(text);
        }
      } catch {
        // execCommand fallback also failed
      }
    }
  }

  /**
   * Cleanup event listeners
   */
  public dispose(): void {
    if (this.options.autoRetryOnFocus) {
      window.removeEventListener('focus', this.handleFocus);
    }
  }
}
