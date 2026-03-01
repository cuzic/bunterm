/**
 * Preview Pane
 *
 * Manages the preview iframe and resizing functionality.
 */

const STORAGE_KEY_WIDTH = 'tui-preview-width';
const MIN_WIDTH = 200;
const MAX_WIDTH = window.innerWidth * 0.8;

export interface PreviewPaneElements {
  pane: HTMLElement;
  header: HTMLElement;
  titleSpan: HTMLElement;
  refreshBtn: HTMLButtonElement;
  selectBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  iframe: HTMLIFrameElement;
  resizer: HTMLElement;
}

export interface PreviewError {
  type: 'error' | 'unhandledrejection';
  message: string;
  url?: string;
  line?: number;
  col?: number;
  stack?: string | null;
}

export type PreviewErrorCallback = (error: PreviewError) => void;
export type PreviewConsoleErrorCallback = (message: string) => void;

export class PreviewPane {
  private elements: PreviewPaneElements | null = null;
  private width: number;
  private isResizing = false;
  private currentUrl: string | null = null;
  private onError: PreviewErrorCallback | null = null;
  private onConsoleError: PreviewConsoleErrorCallback | null = null;

  constructor(defaultWidth = 400) {
    this.width = this.loadWidth() || defaultWidth;
    this.setupMessageListener();
  }

  /**
   * Set error callback
   */
  setOnError(callback: PreviewErrorCallback): void {
    this.onError = callback;
  }

  /**
   * Set console error callback
   */
  setOnConsoleError(callback: PreviewConsoleErrorCallback): void {
    this.onConsoleError = callback;
  }

  /**
   * Setup postMessage listener for errors from iframe
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      // Only handle messages from our iframe
      if (!this.elements) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'preview-error' && data.error) {
        this.onError?.(data.error as PreviewError);
      } else if (data.type === 'preview-console-error' && data.message) {
        this.onConsoleError?.(data.message as string);
      }
    });
  }

  /**
   * Bind DOM elements
   */
  bindElements(elements: PreviewPaneElements): void {
    this.elements = elements;
    this.setupResizer();
    this.applyWidth();
  }

  /**
   * Show the preview pane
   */
  show(): void {
    if (!this.elements) {
      return;
    }

    this.elements.pane.classList.remove('hidden');
    document.body.classList.add('preview-open');
    this.updateTerminalWidth();
  }

  /**
   * Hide the preview pane
   */
  hide(): void {
    if (!this.elements) {
      return;
    }

    this.elements.pane.classList.add('hidden');
    document.body.classList.remove('preview-open');
    this.resetTerminalWidth();
  }

  /**
   * Check if pane is visible
   */
  isVisible(): boolean {
    return this.elements?.pane ? !this.elements.pane.classList.contains('hidden') : false;
  }

  /**
   * Load a URL in the iframe
   */
  loadUrl(url: string): void {
    if (!this.elements) {
      return;
    }

    this.currentUrl = url;
    this.elements.iframe.src = url;
  }

  /**
   * Reload the current URL
   */
  reload(): void {
    if (!this.elements || !this.currentUrl) {
      return;
    }

    // Add cache-busting parameter
    const url = new URL(this.currentUrl, window.location.href);
    url.searchParams.set('_t', Date.now().toString());
    this.elements.iframe.src = url.toString();
  }

  /**
   * Set the title
   */
  setTitle(title: string): void {
    if (!this.elements) {
      return;
    }
    this.elements.titleSpan.textContent = title;
  }

  /**
   * Get the current URL
   */
  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  /**
   * Get the current width
   */
  getWidth(): number {
    return this.width;
  }

  /**
   * Setup resize functionality
   */
  private setupResizer(): void {
    if (!this.elements) {
      return;
    }

    const { resizer } = this.elements;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.startResize();
    });

    resizer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startResize();
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isResizing) {
        this.resize(e.clientX);
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (this.isResizing && e.touches[0]) {
        this.resize(e.touches[0].clientX);
      }
    });

    document.addEventListener('mouseup', () => {
      this.stopResize();
    });

    document.addEventListener('touchend', () => {
      this.stopResize();
    });
  }

  /**
   * Start resizing
   */
  private startResize(): void {
    this.isResizing = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    // Disable iframe pointer events during resize
    if (this.elements) {
      this.elements.iframe.style.pointerEvents = 'none';
    }
  }

  /**
   * Resize to position
   */
  private resize(clientX: number): void {
    const newWidth = window.innerWidth - clientX;
    this.width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    this.applyWidth();
    this.updateTerminalWidth();
  }

  /**
   * Stop resizing
   */
  private stopResize(): void {
    if (!this.isResizing) {
      return;
    }

    this.isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Re-enable iframe pointer events
    if (this.elements) {
      this.elements.iframe.style.pointerEvents = '';
    }

    this.saveWidth();
  }

  /**
   * Apply width to pane
   */
  private applyWidth(): void {
    if (!this.elements) {
      return;
    }

    this.elements.pane.style.width = `${this.width}px`;
    document.documentElement.style.setProperty('--preview-width', `${this.width}px`);
  }

  /**
   * Update terminal width to accommodate preview pane
   * Calls fit multiple times to ensure proper resize after CSS transition
   */
  private updateTerminalWidth(): void {
    // Trigger xterm.js fit multiple times to ensure proper resize
    if (window.fitAddon) {
      // First fit after CSS is applied
      setTimeout(() => {
        window.fitAddon?.fit();
      }, 50);
      // Second fit to ensure layout is stable
      setTimeout(() => {
        window.fitAddon?.fit();
      }, 200);
    }
  }

  /**
   * Reset terminal width
   */
  private resetTerminalWidth(): void {
    document.documentElement.style.removeProperty('--preview-width');
    this.updateTerminalWidth();
  }

  /**
   * Save width to localStorage
   */
  private saveWidth(): void {
    try {
      localStorage.setItem(STORAGE_KEY_WIDTH, this.width.toString());
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Load width from localStorage
   */
  private loadWidth(): number | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WIDTH);
      if (stored) {
        const width = Number.parseInt(stored, 10);
        if (!Number.isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH) {
          return width;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return null;
  }
}
