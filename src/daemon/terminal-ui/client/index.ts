/**
 * Toolbar Client Entry Point
 *
 * Main application orchestrator that initializes and coordinates
 * all toolbar components.
 */

import { AutoRunManager } from './AutoRunManager.js';
import { ClipboardHistoryManager } from './ClipboardHistoryManager.js';
import { FileTransferManager } from './FileTransferManager.js';
import { FileWatcherClient } from './FileWatcherClient.js';
import { FontSizeManager } from './FontSizeManager.js';
import { InputHandler } from './InputHandler.js';
import { LinkManager } from './LinkManager.js';
import { ModifierKeyState } from './ModifierKeyState.js';
import { NotificationManager } from './NotificationManager.js';
import { PreviewManager } from './PreviewManager.js';
import { PreviewPane } from './PreviewPane.js';
import { QuoteManager } from './QuoteManager.js';
import { SearchManager } from './SearchManager.js';
import { SessionSwitcher } from './SessionSwitcher.js';
import { ShareManager } from './ShareManager.js';
import { SmartPasteManager } from './SmartPasteManager.js';
import { SnippetManager } from './SnippetManager.js';
import { TerminalController } from './TerminalController.js';
import { TouchGestureHandler } from './TouchGestureHandler.js';
import { WebSocketConnection } from './WebSocketConnection.js';
import { toolbarEvents } from './events.js';
import type {
  SessionSwitcherElements,
  SmartPasteElements,
  TerminalUiConfig,
  ToolbarElements
} from './types.js';
import { STORAGE_KEYS } from './types.js';
import { bindClick, isMobileDevice } from './utils.js';

class ToolbarApp {
  private config: TerminalUiConfig;
  private elements: ToolbarElements;

  private ws: WebSocketConnection;
  private terminal: TerminalController;
  private modifiers: ModifierKeyState;
  private input: InputHandler;
  private search: SearchManager;
  private link: LinkManager;
  private notifications: NotificationManager;
  private share: ShareManager;
  private snippet: SnippetManager;
  private clipboardHistory: ClipboardHistoryManager;
  private fileTransfer: FileTransferManager;
  private smartPaste: SmartPasteManager;
  private touch: TouchGestureHandler;
  private fontSizeManager: FontSizeManager;
  private autoRun: AutoRunManager;
  private fileWatcher: FileWatcherClient;
  private preview: PreviewManager;
  private sessionSwitcher: SessionSwitcher;
  private quote: QuoteManager;

  private isMobile: boolean;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.isMobile = isMobileDevice();

    // Get DOM elements
    this.elements = this.getElements();

    // Initialize components
    this.ws = new WebSocketConnection();
    this.terminal = new TerminalController(config);
    this.modifiers = new ModifierKeyState();
    this.input = new InputHandler(this.ws, this.modifiers);
    this.search = new SearchManager(() => this.terminal.findTerminal());
    this.link = new LinkManager(() => this.terminal.findTerminal());
    this.notifications = new NotificationManager(config);
    this.snippet = new SnippetManager(this.input);
    this.clipboardHistory = new ClipboardHistoryManager(this.input);
    this.fileTransfer = new FileTransferManager(config);
    this.smartPaste = new SmartPasteManager(config, this.input, this.clipboardHistory);
    this.touch = new TouchGestureHandler(config, this.terminal, this.input, this.modifiers);
    this.fontSizeManager = new FontSizeManager(config);
    this.autoRun = new AutoRunManager();
    this.fileWatcher = new FileWatcherClient(config);
    const previewPane = new PreviewPane();
    this.preview = new PreviewManager(config, {
      pane: previewPane,
      watcher: this.fileWatcher
    });
    this.sessionSwitcher = new SessionSwitcher(config);
    this.quote = new QuoteManager(config);
  }

  /**
   * Set document title with session name
   * Extracts session name from URL path: /base_path/session-name/
   */
  private setDocumentTitle(): void {
    const basePath = this.config.base_path;
    const path = window.location.pathname;

    // Remove base path and extract session name
    // Path format: /ttyd-mux/session-name/ or /ttyd-mux/session-name
    if (path.startsWith(basePath)) {
      const remainder = path.slice(basePath.length);
      // Remove leading/trailing slashes and get first segment
      const segments = remainder.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) {
        const sessionName = decodeURIComponent(segments[0]);
        document.title = `${sessionName} - ttyd-mux`;
        return;
      }
    }

    // Fallback
    document.title = 'ttyd-mux';
  }

  /**
   * Get all toolbar DOM elements
   */
  private getElements(): ToolbarElements {
    return {
      container: document.getElementById('tui') as HTMLElement,
      input: document.getElementById('tui-input') as HTMLTextAreaElement,
      sendBtn: document.getElementById('tui-send') as HTMLButtonElement,
      enterBtn: document.getElementById('tui-enter') as HTMLButtonElement,
      zoomInBtn: document.getElementById('tui-zoomin') as HTMLButtonElement,
      zoomOutBtn: document.getElementById('tui-zoomout') as HTMLButtonElement,
      runBtn: document.getElementById('tui-run') as HTMLButtonElement,
      toggleBtn: document.getElementById('tui-toggle') as HTMLButtonElement,
      ctrlBtn: document.getElementById('tui-ctrl') as HTMLButtonElement,
      altBtn: document.getElementById('tui-alt') as HTMLButtonElement,
      shiftBtn: document.getElementById('tui-shift') as HTMLButtonElement,
      escBtn: document.getElementById('tui-esc') as HTMLButtonElement,
      tabBtn: document.getElementById('tui-tab') as HTMLButtonElement,
      upBtn: document.getElementById('tui-up') as HTMLButtonElement,
      downBtn: document.getElementById('tui-down') as HTMLButtonElement,
      copyAllBtn: document.getElementById('tui-copyall') as HTMLButtonElement,
      pasteBtn: document.getElementById('tui-paste') as HTMLButtonElement,
      autoBtn: document.getElementById('tui-auto') as HTMLButtonElement,
      minimizeBtn: document.getElementById('tui-minimize') as HTMLButtonElement,
      notifyBtn: document.getElementById('tui-notify') as HTMLButtonElement,
      shareBtn: document.getElementById('tui-share') as HTMLButtonElement,
      snippetBtn: document.getElementById('tui-snippet') as HTMLButtonElement,
      downloadBtn: document.getElementById('tui-download') as HTMLButtonElement,
      uploadBtn: document.getElementById('tui-upload') as HTMLButtonElement,
      previewBtn: document.getElementById('tui-preview') as HTMLButtonElement,
      // Share modal elements
      shareModal: document.getElementById('tui-share-modal') as HTMLElement,
      shareModalClose: document.getElementById('tui-share-modal-close') as HTMLButtonElement,
      shareCreate: document.getElementById('tui-share-create') as HTMLButtonElement,
      shareResult: document.getElementById('tui-share-result') as HTMLElement,
      shareUrl: document.getElementById('tui-share-url') as HTMLInputElement,
      shareCopy: document.getElementById('tui-share-copy') as HTMLButtonElement,
      shareQr: document.getElementById('tui-share-qr') as HTMLButtonElement,
      // Search bar elements
      searchBar: document.getElementById('tui-search-bar') as HTMLElement,
      searchInput: document.getElementById('tui-search-input') as HTMLInputElement,
      searchCount: document.getElementById('tui-search-count') as HTMLElement,
      searchPrevBtn: document.getElementById('tui-search-prev') as HTMLButtonElement,
      searchNextBtn: document.getElementById('tui-search-next') as HTMLButtonElement,
      searchCaseBtn: document.getElementById('tui-search-case') as HTMLButtonElement,
      searchRegexBtn: document.getElementById('tui-search-regex') as HTMLButtonElement,
      searchCloseBtn: document.getElementById('tui-search-close') as HTMLButtonElement,
      searchToolbarBtn: document.getElementById('tui-search') as HTMLButtonElement
    };
  }

  /**
   * Initialize the toolbar application
   */
  initialize(): void {
    // Set document title with session name
    this.setDocumentTitle();

    // Bind component elements
    this.modifiers.bindElements(
      this.elements.ctrlBtn,
      this.elements.altBtn,
      this.elements.shiftBtn
    );

    this.search.bindElements(
      this.elements.searchBar,
      this.elements.searchInput,
      this.elements.searchCount,
      this.elements.searchCaseBtn,
      this.elements.searchRegexBtn
    );

    this.notifications.bindElement(this.elements.notifyBtn);

    this.share = new ShareManager(this.config);
    this.share.bindElements(
      this.elements.shareBtn,
      this.elements.shareModal,
      this.elements.shareModalClose,
      this.elements.shareCreate,
      this.elements.shareResult,
      this.elements.shareUrl,
      this.elements.shareCopy,
      this.elements.shareQr
    );

    this.snippet.bindElements(
      this.elements.snippetBtn,
      document.getElementById('tui-snippet-modal') as HTMLElement,
      document.getElementById('tui-snippet-modal-close') as HTMLButtonElement,
      document.getElementById('tui-snippet-add') as HTMLButtonElement,
      document.getElementById('tui-snippet-import') as HTMLButtonElement,
      document.getElementById('tui-snippet-export') as HTMLButtonElement,
      document.getElementById('tui-snippet-search') as HTMLInputElement,
      document.getElementById('tui-snippet-list') as HTMLElement,
      document.getElementById('tui-snippet-add-form') as HTMLElement,
      document.getElementById('tui-snippet-add-name') as HTMLInputElement,
      document.getElementById('tui-snippet-add-command') as HTMLTextAreaElement,
      document.getElementById('tui-snippet-add-save') as HTMLButtonElement,
      document.getElementById('tui-snippet-add-cancel') as HTMLButtonElement
    );

    this.fileTransfer.bindElements(
      this.elements.downloadBtn,
      this.elements.uploadBtn,
      document.getElementById('tui-file-modal') as HTMLElement,
      document.getElementById('tui-file-modal-close') as HTMLButtonElement,
      document.getElementById('tui-file-modal-title') as HTMLElement,
      document.getElementById('tui-file-list') as HTMLElement,
      document.getElementById('tui-file-breadcrumb') as HTMLElement,
      document.getElementById('tui-file-upload-input') as HTMLInputElement,
      document.getElementById('tui-file-upload-btn') as HTMLButtonElement
    );

    this.autoRun.bindElement(this.elements.autoBtn);
    this.clipboardHistory.bindPasteButton(this.elements.pasteBtn);

    // Preview elements
    this.preview.bindElements(this.elements.previewBtn, {
      pane: document.getElementById('tui-preview-pane') as HTMLElement,
      header: document.getElementById('tui-preview-header') as HTMLElement,
      titleSpan: document.getElementById('tui-preview-title') as HTMLElement,
      refreshBtn: document.getElementById('tui-preview-refresh') as HTMLButtonElement,
      selectBtn: document.getElementById('tui-preview-select') as HTMLButtonElement,
      closeBtn: document.getElementById('tui-preview-close') as HTMLButtonElement,
      iframe: document.getElementById('tui-preview-iframe') as HTMLIFrameElement,
      resizer: document.getElementById('tui-preview-resizer') as HTMLElement
    });

    // Setup preview error handler
    this.preview.setErrorHandler((error) => {
      const message = error.line ? `${error.message} (${error.url}:${error.line})` : error.message;
      this.notifications.showToast(`Preview error: ${message}`, 'error');
    });

    // Smart paste elements
    const smartPasteElements: SmartPasteElements = {
      previewModal: document.getElementById('tui-image-preview-modal') as HTMLElement,
      previewClose: document.getElementById('tui-image-preview-close') as HTMLButtonElement,
      previewImg: document.getElementById('tui-image-preview-img') as HTMLImageElement,
      previewPrev: document.getElementById('tui-image-preview-prev') as HTMLButtonElement,
      previewNext: document.getElementById('tui-image-preview-next') as HTMLButtonElement,
      previewCounter: document.getElementById('tui-image-preview-counter') as HTMLElement,
      previewDots: document.getElementById('tui-image-preview-dots') as HTMLElement,
      previewRemove: document.getElementById('tui-image-preview-remove') as HTMLButtonElement,
      previewCancel: document.getElementById('tui-image-preview-cancel') as HTMLButtonElement,
      previewSubmit: document.getElementById('tui-image-preview-submit') as HTMLButtonElement,
      dropZone: document.getElementById('tui-drop-zone') as HTMLElement
    };
    this.smartPaste.bindElements(smartPasteElements);
    this.smartPaste.bindInputTextarea(this.elements.input);

    // Session switcher elements
    const sessionSwitcherElements: SessionSwitcherElements = {
      modal: document.getElementById('tui-session-modal') as HTMLElement,
      modalClose: document.getElementById('tui-session-modal-close') as HTMLButtonElement,
      refreshBtn: document.getElementById('tui-session-refresh') as HTMLButtonElement,
      searchInput: document.getElementById('tui-session-search') as HTMLInputElement,
      sessionList: document.getElementById('tui-session-list') as HTMLElement,
      sessionBtn: document.getElementById('tui-session') as HTMLButtonElement
    };
    this.sessionSwitcher.bindElements(sessionSwitcherElements);

    // Quote modal elements
    this.quote.bindElements({
      modal: document.getElementById('tui-quote-modal') as HTMLElement,
      modalClose: document.getElementById('tui-quote-modal-close') as HTMLButtonElement,
      tabs: document.getElementById('tui-quote-tabs') as HTMLElement,
      controls: document.getElementById('tui-quote-controls') as HTMLElement,
      selectAllBtn: document.getElementById('tui-quote-select-all') as HTMLButtonElement,
      clearBtn: document.getElementById('tui-quote-clear') as HTMLButtonElement,
      list: document.getElementById('tui-quote-list') as HTMLElement,
      footer: document.getElementById('tui-quote-footer') as HTMLElement,
      selectionInfo: document.getElementById('tui-quote-selection-info') as HTMLElement,
      copyBtn: document.getElementById('tui-quote-copy') as HTMLButtonElement,
      quoteBtn: document.getElementById('tui-quote') as HTMLButtonElement
    });

    // Setup event listeners
    this.setupEventListeners();

    // Setup touch gestures
    this.touch.setup();

    // Setup bell handler (emits 'notification:bell' via EventBus)
    // and initialize link addon for clickable URLs
    setTimeout(() => {
      this.terminal.setupBellHandler();
      this.link.initialize();
    }, 1000);

    // Subscribe to EventBus events
    this.setupEventBusListeners();

    // Restore font size
    this.applyStoredFontSize();

    // Setup visibility change handler
    this.setupVisibilityHandler();

    // Fit terminal after toolbar is visible (toolbar is shown by default)
    // Use fitAfterToolbarChange to properly calculate height based on actual toolbar dimensions
    setTimeout(() => this.fitAfterToolbarChange(), 500);

    // Show onboarding on mobile
    if (this.isMobile) {
      setTimeout(() => this.showOnboarding(), 1500);
    }
  }

  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    const { elements } = this;

    // Send button
    bindClick(elements.sendBtn, () => this.submitInput());

    // Enter button
    bindClick(elements.enterBtn, () => this.input.sendEnter());

    // Run button
    bindClick(elements.runBtn, () => this.runInput());

    // Zoom buttons
    bindClick(elements.zoomInBtn, () => {
      this.terminal.zoomTerminal(2);
      toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
    });

    bindClick(elements.zoomOutBtn, () => {
      this.terminal.zoomTerminal(-2);
      toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
    });

    // Modifier buttons
    bindClick(elements.ctrlBtn, () => this.modifiers.toggle('ctrl'));
    bindClick(elements.altBtn, () => this.modifiers.toggle('alt'));
    bindClick(elements.shiftBtn, () => this.modifiers.toggle('shift'));

    // Auto-run button
    bindClick(elements.autoBtn, () => this.autoRun.toggle());

    // Special key buttons
    bindClick(elements.escBtn, () => this.input.sendEsc());
    bindClick(elements.tabBtn, () => this.input.sendTab());
    bindClick(elements.upBtn, () => this.input.sendArrow('up'));
    bindClick(elements.downBtn, () => this.input.sendArrow('down'));

    // Copy all button
    bindClick(elements.copyAllBtn, () => this.terminal.copyAll());

    // Paste button - uses smart paste for text/image detection
    bindClick(elements.pasteBtn, () => {
      // Don't paste if this was a long press (history popup shown)
      if (this.clipboardHistory.isLongPressInProgress()) {
        return;
      }
      // Use smart paste to detect content type (text vs image)
      this.smartPaste.smartPaste();
    });

    // Notification button
    bindClick(elements.notifyBtn, () => this.notifications.toggle());

    // Minimize button
    bindClick(elements.minimizeBtn, () => {
      elements.container.classList.toggle('minimized');
      const isMinimized = elements.container.classList.contains('minimized');
      // Update title to show opposite action
      elements.minimizeBtn.title = isMinimized ? 'ツールバーを展開' : 'コンパクト表示';
      // Fit terminal multiple times on mobile to ensure proper layout
      this.fitAfterToolbarChange();
    });

    // Toggle button
    bindClick(elements.toggleBtn, () => this.toggleToolbar());

    // Search bar events
    this.setupSearchEvents();

    // Input textarea events
    this.setupInputEvents();

    // Global keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  /**
   * Setup search bar event listeners
   */
  private setupSearchEvents(): void {
    const { elements } = this;

    bindClick(elements.searchToolbarBtn, () => this.search.toggle());
    bindClick(elements.searchCloseBtn, () => this.search.toggle(false));
    bindClick(elements.searchNextBtn, () => this.search.findNext());
    bindClick(elements.searchPrevBtn, () => this.search.findPrevious());
    bindClick(elements.searchCaseBtn, () => this.search.toggleCaseSensitive());
    bindClick(elements.searchRegexBtn, () => this.search.toggleRegex());

    elements.searchInput.addEventListener('input', () => {
      this.search.doSearch();
    });

    elements.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !(e as KeyboardEvent & { isComposing: boolean }).isComposing) {
        e.preventDefault();
        if (e.shiftKey) {
          this.search.findPrevious();
        } else {
          this.search.findNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.search.toggle(false);
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (e.shiftKey) {
          this.search.findPrevious();
        } else {
          this.search.findNext();
        }
      }
    });
  }

  /**
   * Setup input textarea event listeners
   */
  private setupInputEvents(): void {
    const { input } = this.elements;

    input.addEventListener('input', () => this.adjustTextareaHeight());

    input.addEventListener('keydown', (e) => {
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !(e as KeyboardEvent & { isComposing: boolean }).isComposing
      ) {
        e.preventDefault();
        this.submitInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.toggleToolbar(false);
      }
    });
  }

  /**
   * Setup global keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl+J to toggle toolbar
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        this.toggleToolbar();
      }
      // Ctrl+K to toggle session switcher
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        this.sessionSwitcher.toggle();
      }
      // Ctrl+Shift+F to toggle search bar
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.search.toggle();
      }
      // Ctrl+V for smart paste (intercept default paste)
      if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
        e.preventDefault();
        this.smartPaste.smartPaste();
      }
      // Ctrl+Shift+C to copy selection to clipboard
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.terminal.copySelection().then((success) => {
          if (success) {
            // Visual feedback - brief flash on terminal
            const termEl = document.querySelector('.xterm') as HTMLElement;
            if (termEl) {
              termEl.style.opacity = '0.7';
              setTimeout(() => {
                termEl.style.opacity = '1';
              }, 100);
            }
          }
        });
      }
      // Ctrl+Shift+V to paste from clipboard
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        this.terminal.paste(this.input, this.clipboardHistory);
      }
      // Ctrl+Shift+Q to open quote modal
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        this.quote.toggle();
      }
    });
  }

  /**
   * Adjust textarea height based on content
   */
  private adjustTextareaHeight(): void {
    const input = this.elements.input;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  /**
   * Submit input text to terminal
   */
  private submitInput(): void {
    const text = this.elements.input.value;

    // If empty, just send Enter to terminal
    if (!text) {
      this.input.sendEnter();
      return;
    }

    if (this.input.sendText(text)) {
      this.elements.input.value = '';
      this.adjustTextareaHeight();

      // Auto mode: send Enter after 1 second
      if (this.autoRun.isActive()) {
        setTimeout(() => this.input.sendEnter(), 1000);
      }
    }
  }

  /**
   * Run input (send text + Enter after delay)
   */
  private runInput(): void {
    const text = this.elements.input.value;
    if (!text) {
      return;
    }

    if (this.input.sendText(text)) {
      this.elements.input.value = '';
      this.adjustTextareaHeight();
      // Wait 1 second then send Enter
      setTimeout(() => this.input.sendEnter(), 1000);
    }
  }

  /**
   * Toggle toolbar visibility
   */
  private toggleToolbar(show?: boolean): void {
    const { container, input, toggleBtn } = this.elements;

    if (typeof show === 'boolean') {
      container.classList.toggle('hidden', !show);
    } else {
      container.classList.toggle('hidden');
    }

    const isHidden = container.classList.contains('hidden');

    // Update toggle button title
    toggleBtn.title = isHidden ? 'ツールバーを表示 (Ctrl+J)' : 'ツールバーを隠す (Ctrl+J)';

    if (isHidden) {
      const terminal = document.querySelector('.xterm-helper-textarea') as HTMLElement;
      if (this.isMobile) {
        // On mobile, blur to prevent keyboard from appearing
        terminal?.blur();
      } else {
        // On desktop, focus terminal for keyboard input
        terminal?.focus();
      }
    } else {
      if (!this.isMobile) {
        // On desktop, auto-focus input for immediate typing
        input.focus();
      }
      // On mobile, user must tap input to show keyboard
    }

    // Fit terminal multiple times on mobile to ensure proper layout
    this.fitAfterToolbarChange();
  }

  /**
   * Fit terminal after toolbar visibility change
   * Dynamically adjusts terminal container height based on actual toolbar height.
   * Uses !important to override CSS rules that use hard-coded values.
   */
  private fitAfterToolbarChange(): void {
    const adjustAndFit = () => {
      // Get actual toolbar height (CSS assumes fixed values that may not match actual height)
      const toolbar = this.elements.container;
      const toolbarHeight = toolbar.classList.contains('hidden') ? 0 : toolbar.offsetHeight;

      // Find terminal container and adjust its height
      const terminalContainer = document.getElementById('terminal') ||
                                document.querySelector('.terminal') ||
                                document.querySelector('.terminal-pane');

      if (terminalContainer) {
        const viewportHeight = window.innerHeight;
        const newHeight = viewportHeight - toolbarHeight;

        // Use setProperty with 'important' to override CSS !important rules
        (terminalContainer as HTMLElement).style.setProperty('height', `${newHeight}px`, 'important');

        // Also update xterm internal elements for proper fit
        const xterm = terminalContainer.querySelector('.xterm') as HTMLElement;
        const xtermViewport = terminalContainer.querySelector('.xterm-viewport') as HTMLElement;
        const xtermScreen = terminalContainer.querySelector('.xterm-screen') as HTMLElement;

        if (xterm) {
          xterm.style.setProperty('height', '100%', 'important');
        }
        if (xtermViewport) {
          xtermViewport.style.setProperty('height', '100%', 'important');
        }
        if (xtermScreen) {
          xtermScreen.style.setProperty('height', '100%', 'important');
        }
      }

      this.terminal.fitTerminal();
    };

    adjustAndFit();
    if (this.isMobile) {
      setTimeout(adjustAndFit, 50);
      setTimeout(adjustAndFit, 150);
      setTimeout(adjustAndFit, 300);
    } else {
      setTimeout(adjustAndFit, 100);
    }
  }

  /**
   * Apply stored font size from localStorage
   */
  private applyStoredFontSize(): void {
    const applySize = () => {
      const term = this.terminal.findTerminal();
      if (term?.options) {
        const storedSize = this.fontSizeManager.load();
        term.options.fontSize = storedSize;
        this.terminal.fitTerminal();
      }
    };

    // Try multiple times as terminal may not be ready
    setTimeout(applySize, 500);
    setTimeout(applySize, 1500);
  }

  /**
   * Setup EventBus listeners for inter-manager communication
   */
  private setupEventBusListeners(): void {
    // Listen for bell events
    toolbarEvents.on('notification:bell', () => {});

    // Listen for font change events
    toolbarEvents.on('font:change', (size) => {
      this.fontSizeManager.save(size);
    });

    // Listen for error events
    toolbarEvents.on('error', (_error) => {});

    // Listen for preview file select events
    document.addEventListener('tui-preview-select', ((e: CustomEvent) => {
      const callback = e.detail?.callback as
        | ((selection: { path: string; isDirectory: boolean }) => void)
        | undefined;
      if (callback) {
        this.fileTransfer.openForPreview(callback);
      }
    }) as EventListener);
  }

  /**
   * Setup visibility change handler for auto-reload
   */
  private setupVisibilityHandler(): void {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (!this.ws.isConnected()) {
          this.handleReconnect();
        }
      }
    });

    // Listen for WebSocket close events (dispatched by interception script)
    window.addEventListener('ttyd-ws-close', () => {
      // Small delay to avoid immediate reconnect on page unload
      setTimeout(() => {
        if (!this.ws.isConnected()) {
          this.handleReconnect();
        }
      }, 500);
    });
  }

  /**
   * Handle reconnection with daemon health check and retries
   */
  private handleReconnect(attempt = 0): void {
    const basePath = this.config.base_path;
    const maxRetries = this.config.reconnect_retries;
    const retryInterval = this.config.reconnect_interval;

    // Show retry status overlay
    this.showRetryStatus(attempt, maxRetries);

    // Check if daemon is alive by fetching the sessions API
    fetch(`${basePath}/api/sessions`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
      .then((response) => {
        if (response.ok) {
          // Daemon is alive, safe to reload
          this.hideRetryStatus();
          location.reload();
        } else {
          // Daemon responded but with an error
          throw new Error('Server error');
        }
      })
      .catch((_error) => {
        // Daemon is not responding - retry or show error
        if (attempt < maxRetries) {
          // Schedule next retry
          setTimeout(() => {
            this.handleReconnect(attempt + 1);
          }, retryInterval);
        } else {
          // Max retries reached, show error
          this.hideRetryStatus();
          this.showReconnectError(
            'サーバーに接続できません。ttyd-mux が起動しているか確認してください。'
          );
        }
      });
  }

  /**
   * Show retry status overlay
   */
  private showRetryStatus(attempt: number, maxRetries: number): void {
    // Remove existing overlay if any
    let overlay = document.getElementById('tui-retry-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tui-retry-overlay';
      overlay.innerHTML = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          color: white;
          font-family: system-ui, sans-serif;
        ">
          <div style="font-size: 32px; margin-bottom: 20px;">🔄</div>
          <div style="font-size: 18px; margin-bottom: 10px;">再接続中...</div>
          <div id="tui-retry-count" style="font-size: 14px; color: #aaa;"></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    // Update retry count
    const countEl = document.getElementById('tui-retry-count');
    if (countEl) {
      countEl.textContent = `リトライ ${attempt + 1}/${maxRetries + 1}`;
    }
  }

  /**
   * Hide retry status overlay
   */
  private hideRetryStatus(): void {
    const overlay = document.getElementById('tui-retry-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Show reconnection error overlay
   */
  private showReconnectError(message: string): void {
    // Remove existing overlay if any
    const existing = document.getElementById('tui-reconnect-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'tui-reconnect-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        color: white;
        font-family: system-ui, sans-serif;
      ">
        <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
        <div style="font-size: 18px; margin-bottom: 10px;">接続が切断されました</div>
        <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">${message}</div>
        <div style="display: flex; gap: 10px;">
          <button id="tui-reconnect-retry" style="
            padding: 10px 20px;
            font-size: 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">再接続</button>
          <button id="tui-reconnect-portal" style="
            padding: 10px 20px;
            font-size: 16px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">ポータルへ</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Add event listeners
    document.getElementById('tui-reconnect-retry')?.addEventListener('click', () => {
      overlay.remove();
      this.handleReconnect();
    });

    document.getElementById('tui-reconnect-portal')?.addEventListener('click', () => {
      window.location.href = `${this.config.base_path}/`;
    });
  }

  /**
   * Show onboarding tips for first-time users
   */
  private showOnboarding(): void {
    const onboarding = document.getElementById('tui-onboarding');
    if (!onboarding) {
      return;
    }

    try {
      if (localStorage.getItem(STORAGE_KEYS.ONBOARDING_SHOWN)) {
        onboarding.remove();
        return;
      }
    } catch {
      // localStorage not available
    }

    // Show onboarding tooltip
    onboarding.style.display = 'block';

    const closeBtn = document.getElementById('tui-onboarding-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        onboarding.remove();
        try {
          localStorage.setItem(STORAGE_KEYS.ONBOARDING_SHOWN, '1');
        } catch {
          // Ignore
        }
      });
    }

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      if (onboarding.parentNode) {
        onboarding.remove();
        try {
          localStorage.setItem(STORAGE_KEYS.ONBOARDING_SHOWN, '1');
        } catch {
          // Ignore
        }
      }
    }, 15000);
  }
}

/**
 * Setup Sentry global error handlers for client-side error monitoring
 */
function setupSentryErrorHandlers(config: TerminalUiConfig): void {
  if (!config.sentry?.enabled || !window.Sentry) {
    return;
  }

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    window.Sentry?.captureException(error);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    window.Sentry?.captureException(event.reason);
  });
}

// Initialize when DOM is ready
const config = window.__TERMINAL_UI_CONFIG__;
if (config) {
  // Setup Sentry error handlers first
  setupSentryErrorHandlers(config);

  // In native terminal mode, wait for initTerminalUi() to be called
  // because __TERMINAL_CLIENT__ is not yet available when this script loads
  if (config.isNativeTerminal) {
    // Export initialization function for native mode
    window.initTerminalUi = () => {
      const app = new ToolbarApp(config);
      app.initialize();
    };
  } else {
    // ttyd mode: initialize immediately
    const app = new ToolbarApp(config);
    app.initialize();
  }
}
