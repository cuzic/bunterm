/**
 * Preview Pane
 *
 * Manages the preview iframe and resizing functionality.
 */

const STORAGE_KEY_WIDTH = 'tui-preview-width';
const MIN_WIDTH = 200;

/** Calculate max width dynamically based on current window size */
function getMaxWidth(): number {
  return window.innerWidth * 0.8;
}

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

  // Event listener references for cleanup
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private mouseMoveListener: ((e: MouseEvent) => void) | null = null;
  private touchMoveListener: ((e: TouchEvent) => void) | null = null;
  private mouseUpListener: (() => void) | null = null;
  private touchEndListener: (() => void) | null = null;
  private resizerMouseDownListener: ((e: MouseEvent) => void) | null = null;
  private resizerTouchStartListener: ((e: TouchEvent) => void) | null = null;

  constructor(defaultWidth = 400) {
    this.width = this.loadWidth() || defaultWidth;
    this.setupMessageListener();
  }

  /**
   * Dispose of all event listeners
   */
  dispose(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    if (this.mouseMoveListener) {
      document.removeEventListener('mousemove', this.mouseMoveListener);
      this.mouseMoveListener = null;
    }
    if (this.touchMoveListener) {
      document.removeEventListener('touchmove', this.touchMoveListener);
      this.touchMoveListener = null;
    }
    if (this.mouseUpListener) {
      document.removeEventListener('mouseup', this.mouseUpListener);
      this.mouseUpListener = null;
    }
    if (this.touchEndListener) {
      document.removeEventListener('touchend', this.touchEndListener);
      this.touchEndListener = null;
    }
    // Clean up resizer listeners
    if (this.elements?.resizer) {
      if (this.resizerMouseDownListener) {
        this.elements.resizer.removeEventListener('mousedown', this.resizerMouseDownListener);
        this.resizerMouseDownListener = null;
      }
      if (this.resizerTouchStartListener) {
        this.elements.resizer.removeEventListener('touchstart', this.resizerTouchStartListener);
        this.resizerTouchStartListener = null;
      }
    }
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
    this.messageListener = (event: MessageEvent) => {
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
    };
    window.addEventListener('message', this.messageListener);
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
    console.log('[PreviewPane] show() called, elements:', !!this.elements);
    if (!this.elements) {
      console.warn('[PreviewPane] show() - elements not bound!');
      return;
    }

    this.elements.pane.classList.remove('hidden');
    document.body.classList.add('preview-open');
    console.log('[PreviewPane] pane shown, classList:', this.elements.pane.className);
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
    console.log('[PreviewPane] loadUrl called:', url, 'elements:', !!this.elements);
    if (!this.elements) {
      console.warn('[PreviewPane] elements not bound!');
      return;
    }

    this.currentUrl = url;
    this.elements.iframe.src = url;
    console.log('[PreviewPane] iframe.src set to:', this.elements.iframe.src);
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

    // Store resizer listeners for cleanup
    this.resizerMouseDownListener = (e: MouseEvent) => {
      e.preventDefault();
      this.startResize();
    };
    resizer.addEventListener('mousedown', this.resizerMouseDownListener);

    this.resizerTouchStartListener = (e: TouchEvent) => {
      e.preventDefault();
      this.startResize();
    };
    resizer.addEventListener('touchstart', this.resizerTouchStartListener);

    // Store document-level listeners for cleanup
    this.mouseMoveListener = (e: MouseEvent) => {
      if (this.isResizing) {
        this.resize(e.clientX);
      }
    };
    document.addEventListener('mousemove', this.mouseMoveListener);

    this.touchMoveListener = (e: TouchEvent) => {
      if (this.isResizing && e.touches[0]) {
        this.resize(e.touches[0].clientX);
      }
    };
    document.addEventListener('touchmove', this.touchMoveListener);

    this.mouseUpListener = () => {
      this.stopResize();
    };
    document.addEventListener('mouseup', this.mouseUpListener);

    this.touchEndListener = () => {
      this.stopResize();
    };
    document.addEventListener('touchend', this.touchEndListener);
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
    this.width = Math.max(MIN_WIDTH, Math.min(getMaxWidth(), newWidth));
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
        if (!Number.isNaN(width) && width >= MIN_WIDTH && width <= getMaxWidth()) {
          return width;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return null;
  }
}
