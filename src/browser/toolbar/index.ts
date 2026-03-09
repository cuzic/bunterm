/**
 * Toolbar Client Entry Point
 *
 * Main application orchestrator that initializes and coordinates
 * all toolbar components.
 */

import { toolbarEvents } from '@/browser/shared/events.js';
import { KeyPriority, KeyRouter } from '@/browser/shared/key-router.js';
import { Scope, on, onBus } from '@/browser/shared/lifecycle.js';
import type {
  SessionSwitcherElements,
  ShareElements,
  SmartPasteElements,
  TerminalUiConfig,
  ToolbarElements
} from '@/browser/shared/types.js';
import { STORAGE_KEYS } from '@/browser/shared/types.js';
import { bindClickScoped, isMobileDevice } from '@/browser/shared/utils.js';
import { FileTransferManager } from '@/features/file-transfer/client/FileTransferManager.js';
import { FileWatcherClient } from '@/features/file-watcher/client/FileWatcherClient.js';
import { NotificationManager } from '@/features/notifications/client/NotificationManager.js';
import { PreviewManager } from '@/features/preview/client/PreviewManager.js';
import { PreviewPane } from '@/features/preview/client/PreviewPane.js';
import { type ToolbarApiClient, createApiClient } from './ApiClient.js';
import { AutoRunManager } from './AutoRunManager.js';
import { ClipboardHistoryManager } from './ClipboardHistoryManager.js';
import { DebugPanel } from './DebugPanel.js';
import { FontSizeManager } from './FontSizeManager.js';
import { InputHandler } from './InputHandler.js';
import { LayoutManager } from './LayoutManager.js';
import { LinkManager } from './LinkManager.js';
import { ModifierKeyState } from './ModifierKeyState.js';
import { QuoteManager } from './QuoteManager.js';
import { SearchManager } from './SearchManager.js';
import { SessionSwitcher } from './SessionSwitcher.js';
import { ShareManager } from './ShareManager.js';
import { SmartPasteManager } from './SmartPasteManager.js';
import { SnippetManager } from './SnippetManager.js';
import { TerminalController } from './TerminalController.js';
import { TouchGestureHandler } from './TouchGestureHandler.js';
import { WebSocketConnection } from './WebSocketConnection.js';

class ToolbarApp {
  private config: TerminalUiConfig;
  private elements: ToolbarElements;
  private apiClient: ToolbarApiClient;

  // Lifecycle management
  private scope = new Scope();
  private keyRouter = new KeyRouter();

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
  private layout: LayoutManager;

  private isMobile: boolean;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.isMobile = isMobileDevice();
    this.apiClient = createApiClient({ basePath: config.base_path });

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
    this.layout = new LayoutManager(this.elements.container, () => this.terminal.fitTerminal());
  }

  /**
   * Set document title with session name
   * Extracts session name from URL path: /base_path/session-name/
   */
  private setDocumentTitle(): void {
    const basePath = this.config.base_path;
    const path = window.location.pathname;

    // Remove base path and extract session name
    // Path format: /bunterm/session-name/ or /bunterm/session-name
    if (path.startsWith(basePath)) {
      const remainder = path.slice(basePath.length);
      // Remove leading/trailing slashes and get first segment
      const segments = remainder.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) {
        const sessionName = decodeURIComponent(segments[0]);
        document.title = `${sessionName} - bunterm`;
        return;
      }
    }

    // Fallback
    document.title = 'bunterm';
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
      reinitBtn: document.getElementById('tui-reinit') as HTMLButtonElement,
      reloadBtn: document.getElementById('tui-reload') as HTMLButtonElement,
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
      buttonsToggleBtn: document.getElementById('tui-buttons-toggle') as HTMLButtonElement,
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
    const shareElements: ShareElements = {
      shareBtn: this.elements.shareBtn,
      modal: this.elements.shareModal,
      modalClose: this.elements.shareModalClose,
      createBtn: this.elements.shareCreate,
      resultSection: this.elements.shareResult,
      urlInput: this.elements.shareUrl,
      copyBtn: this.elements.shareCopy,
      qrBtn: this.elements.shareQr
    };
    this.share.bindElements(shareElements);

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

    // Mount all Mountable components to scope for automatic cleanup
    this.touch.mount(this.scope);
    this.sessionSwitcher.mount(this.scope);
    this.snippet.mount(this.scope);
    this.fileTransfer.mount(this.scope);
    this.share.mount(this.scope);
    this.preview.mount(this.scope);
    this.quote.mount(this.scope);
    this.clipboardHistory.mount(this.scope);
    this.smartPaste.mount(this.scope);
    this.layout.mount(this.scope);

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

    // LayoutManager will handle initial fit after mount
    // The layout.mount() above already calls forceUpdate() which fits the terminal

    // Show onboarding on mobile
    if (this.isMobile) {
      setTimeout(() => this.showOnboarding(), 1500);
    }
  }

  /**
   * Setup all event listeners
   */
  private setupEventListeners(): void {
    const { elements, scope } = this;

    // Send button
    bindClickScoped(scope, elements.sendBtn, () => this.submitInput());

    // Enter button
    bindClickScoped(scope, elements.enterBtn, () => this.input.sendEnter());

    // Run button
    bindClickScoped(scope, elements.runBtn, () => this.runInput());

    // Zoom buttons
    bindClickScoped(scope, elements.zoomInBtn, () => {
      this.terminal.zoomTerminal(2);
      toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
    });

    bindClickScoped(scope, elements.zoomOutBtn, () => {
      this.terminal.zoomTerminal(-2);
      toolbarEvents.emit('font:change', this.terminal.getCurrentFontSize());
    });

    // Reinitialize button - recreate xterm.js instance
    bindClickScoped(scope, elements.reinitBtn, () => {
      const success = this.terminal.reinitialize();
      if (success) {
        // After reinitialize, fit terminal to container
        setTimeout(() => this.layout.forceUpdate(), 100);
      } else {
        // Fall back to page reload if reinitialize not available
        this.terminal.forceReload();
      }
    });

    // Force reload button - full page reload (mobile only)
    bindClickScoped(scope, elements.reloadBtn, () => {
      this.terminal.forceReload();
    });

    // Modifier buttons
    bindClickScoped(scope, elements.ctrlBtn, () => this.modifiers.toggle('ctrl'));
    bindClickScoped(scope, elements.altBtn, () => this.modifiers.toggle('alt'));
    bindClickScoped(scope, elements.shiftBtn, () => this.modifiers.toggle('shift'));

    // Auto-run button
    bindClickScoped(scope, elements.autoBtn, () => this.autoRun.toggle());

    // Special key buttons
    bindClickScoped(scope, elements.escBtn, () => this.input.sendEsc());
    bindClickScoped(scope, elements.tabBtn, () => this.input.sendTab());
    bindClickScoped(scope, elements.upBtn, () => this.input.sendArrow('up'));
    bindClickScoped(scope, elements.downBtn, () => this.input.sendArrow('down'));

    // Copy all button
    bindClickScoped(scope, elements.copyAllBtn, () => this.terminal.copyAll());

    // Paste button - uses smart paste for text/image detection
    bindClickScoped(scope, elements.pasteBtn, () => {
      // Don't paste if this was a long press (history popup shown)
      if (this.clipboardHistory.isLongPressInProgress()) {
        return;
      }
      // Use smart paste to detect content type (text vs image)
      this.smartPaste.smartPaste();
    });

    // Notification button
    bindClickScoped(scope, elements.notifyBtn, () => this.notifications.toggle());

    // Minimize button
    bindClickScoped(scope, elements.minimizeBtn, () => {
      elements.container.classList.toggle('minimized');
      const isMinimized = elements.container.classList.contains('minimized');
      // Update title to show opposite action
      elements.minimizeBtn.title = isMinimized ? 'ツールバーを展開' : 'コンパクト表示';
      // LayoutManager's ResizeObserver will automatically detect height change
      this.layout.scheduleUpdate();
    });

    // Buttons toggle button (collapse/expand buttons while keeping input)
    bindClickScoped(scope, elements.buttonsToggleBtn, () => {
      elements.container.classList.toggle('buttons-collapsed');
      const isCollapsed = elements.container.classList.contains('buttons-collapsed');
      // Update button icon and title
      elements.buttonsToggleBtn.textContent = isCollapsed ? '▼' : '▲';
      elements.buttonsToggleBtn.title = isCollapsed ? 'ボタンを表示' : 'ボタンを非表示';
      // LayoutManager's ResizeObserver will automatically detect height change
      this.layout.scheduleUpdate();
    });

    // Toggle button
    bindClickScoped(scope, elements.toggleBtn, () => this.toggleToolbar());

    // Search bar events
    this.setupSearchEvents();

    // Input textarea events
    this.setupInputEvents();

    // Global keyboard shortcuts via KeyRouter
    this.setupKeyboardShortcuts();
  }

  /**
   * Setup search bar event listeners
   */
  private setupSearchEvents(): void {
    const { elements, scope } = this;

    bindClickScoped(scope, elements.searchToolbarBtn, () => this.search.toggle());
    bindClickScoped(scope, elements.searchCloseBtn, () => this.search.toggle(false));
    bindClickScoped(scope, elements.searchNextBtn, () => this.search.findNext());
    bindClickScoped(scope, elements.searchPrevBtn, () => this.search.findPrevious());
    bindClickScoped(scope, elements.searchCaseBtn, () => this.search.toggleCaseSensitive());
    bindClickScoped(scope, elements.searchRegexBtn, () => this.search.toggleRegex());

    scope.add(
      on(elements.searchInput, 'input', () => {
        this.search.doSearch();
      })
    );

    scope.add(
      on(elements.searchInput, 'keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' && !ke.isComposing) {
          ke.preventDefault();
          if (ke.shiftKey) {
            this.search.findPrevious();
          } else {
            this.search.findNext();
          }
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          this.search.toggle(false);
        } else if (ke.key === 'F3') {
          ke.preventDefault();
          if (ke.shiftKey) {
            this.search.findPrevious();
          } else {
            this.search.findNext();
          }
        }
      })
    );
  }

  /**
   * Setup input textarea event listeners
   */
  private setupInputEvents(): void {
    const { input } = this.elements;
    const { scope } = this;

    scope.add(on(input, 'input', () => this.adjustTextareaHeight()));

    scope.add(
      on(input, 'keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' && !ke.shiftKey && !ke.isComposing) {
          ke.preventDefault();
          this.submitInput();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          this.toggleToolbar(false);
        }
      })
    );
  }

  /**
   * Setup global keyboard shortcuts via KeyRouter
   * All keyboard handlers are registered with priorities for proper event routing.
   */
  private setupKeyboardShortcuts(): void {
    const { scope, keyRouter } = this;

    // Mount the KeyRouter to handle document keydown events
    keyRouter.mount(scope);

    // Priority: CRITICAL (200) - SmartPaste preview modal Escape
    scope.add(
      keyRouter.register((e) => {
        // Skip IME composition
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.smartPaste.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.smartPaste.cancel();
        return true;
      }, KeyPriority.CRITICAL)
    );

    // Priority: MODAL_HIGH (100) - Snippet modal Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.snippet.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.snippet.hide();
        return true;
      }, KeyPriority.MODAL_HIGH)
    );

    // Priority: MODAL_HIGH (100) - File transfer modal Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.fileTransfer.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.fileTransfer.hide();
        return true;
      }, KeyPriority.MODAL_HIGH)
    );

    // Priority: MODAL_HIGH (100) - Share modal Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.share.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.share.hide();
        return true;
      }, KeyPriority.MODAL_HIGH)
    );

    // Priority: MODAL (80) - Quote modal Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.quote.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.quote.close();
        return true;
      }, KeyPriority.MODAL)
    );

    // Priority: PANE (60) - Preview pane Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.preview.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.preview.close();
        return true;
      }, KeyPriority.PANE)
    );

    // Priority: SEARCH (40) - Search bar Ctrl+Shift+F toggle
    scope.add(
      keyRouter.register((e) => {
        // Modifier shortcuts don't need isComposing check
        if (e.key === 'F' && e.ctrlKey && e.shiftKey && !e.altKey) {
          e.preventDefault();
          this.search.toggle();
          return true;
        }
        return false;
      }, KeyPriority.SEARCH)
    );

    // Priority: SEARCH (40) - Search bar Escape
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape' || !this.search.isVisible()) {
          return false;
        }
        e.preventDefault();
        this.search.toggle(false);
        return true;
      }, KeyPriority.SEARCH)
    );

    // Priority: GLOBAL (0) - Ctrl+J toggle toolbar
    scope.add(
      keyRouter.register((e) => {
        if (e.key === 'j' && e.ctrlKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          this.toggleToolbar();
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Ctrl+K toggle session switcher
    scope.add(
      keyRouter.register((e) => {
        if (e.key === 'k' && e.ctrlKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          this.sessionSwitcher.toggle();
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Alt+V smart paste
    scope.add(
      keyRouter.register((e) => {
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'v') {
          e.preventDefault();
          this.smartPaste.smartPaste();
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Ctrl+Shift+C copy selection
    scope.add(
      keyRouter.register((e) => {
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
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Ctrl+Shift+V paste
    scope.add(
      keyRouter.register((e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
          e.preventDefault();
          this.terminal.paste(this.input, this.clipboardHistory);
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Ctrl+Shift+Q quote modal
    scope.add(
      keyRouter.register((e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
          e.preventDefault();
          this.quote.toggle();
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );

    // Priority: GLOBAL (0) - Escape in toolbar input
    scope.add(
      keyRouter.register((e) => {
        if (e.isComposing) {
          return false;
        }
        if (e.key !== 'Escape') {
          return false;
        }

        // If toolbar input has focus
        if (document.activeElement === this.elements.input) {
          e.preventDefault();
          // If input is not empty, clear it
          if (this.elements.input.value) {
            this.elements.input.value = '';
            this.elements.input.style.height = 'auto';
          } else {
            // Empty input - close toolbar and focus terminal
            this.toggleToolbar();
            this.terminal.focus();
          }
          return true;
        }
        return false;
      }, KeyPriority.GLOBAL)
    );
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
   * Toggle toolbar visibility (3-state cycle)
   * State 0: Full toolbar (buttons + input)
   * State 1: Input only (buttons collapsed)
   * State 2: Hidden
   */
  private toggleToolbar(show?: boolean): void {
    const { container, input, toggleBtn } = this.elements;

    // If explicit show value is provided
    if (typeof show === 'boolean') {
      if (show) {
        // Show full toolbar
        container.classList.remove('hidden');
        container.classList.remove('buttons-collapsed');
      } else {
        // Hide completely
        container.classList.add('hidden');
      }
    } else {
      // Cycle through 3 states
      const isHidden = container.classList.contains('hidden');
      const isCollapsed = container.classList.contains('buttons-collapsed');

      if (isHidden) {
        // State 2 → State 0: Hidden → Full toolbar
        container.classList.remove('hidden');
        container.classList.remove('buttons-collapsed');
      } else if (isCollapsed) {
        // State 1 → State 2: Input only → Hidden
        container.classList.add('hidden');
      } else {
        // State 0 → State 1: Full toolbar → Input only
        container.classList.add('buttons-collapsed');
      }
    }

    const isHidden = container.classList.contains('hidden');
    const isCollapsed = container.classList.contains('buttons-collapsed');

    // Update toggle button title based on current state
    if (isHidden) {
      toggleBtn.title = 'ツールバーを表示 (Ctrl+J)';
    } else if (isCollapsed) {
      toggleBtn.title = '入力欄を非表示 (Ctrl+J)';
    } else {
      toggleBtn.title = 'ボタンを非表示 (Ctrl+J)';
    }

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

    // LayoutManager's ResizeObserver will detect toolbar visibility change
    this.layout.scheduleUpdate();
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
    const { scope } = this;

    // Listen for bell events
    scope.add(onBus(toolbarEvents, 'notification:bell', () => {}));

    // Listen for toast notifications
    scope.add(
      onBus(toolbarEvents, 'toast:show', ({ message, type }) => {
        this.notifications.showToast(message, type || 'info');
      })
    );

    // Listen for font change events
    scope.add(
      onBus(toolbarEvents, 'font:change', (size) => {
        this.fontSizeManager.save(size);
      })
    );

    // Listen for error events
    scope.add(onBus(toolbarEvents, 'error', (_error) => {}));

    // Listen for preview file select events
    scope.add(
      on(document, 'tui-preview-select', ((e: CustomEvent) => {
        const callback = e.detail?.callback as
          | ((selection: { path: string; isDirectory: boolean }) => void)
          | undefined;
        if (callback) {
          this.fileTransfer.openForPreview(callback);
        }
      }) as EventListener)
    );
  }

  /**
   * Setup visibility change handler for auto-reload
   */
  private setupVisibilityHandler(): void {
    this.scope.add(
      on(document, 'visibilitychange', () => {
        if (!document.hidden) {
          if (!this.ws.isConnected()) {
            this.handleReconnect();
          }
        }
      })
    );

    // Listen for WebSocket close events (dispatched by interception script)
    this.scope.add(
      on(window, 'bunterm-ws-close', () => {
        // Small delay to avoid immediate reconnect on page unload
        setTimeout(() => {
          if (!this.ws.isConnected()) {
            this.handleReconnect();
          }
        }, 500);
      })
    );
  }

  /**
   * Handle reconnection with daemon health check and retries
   */
  private handleReconnect(attempt = 0): void {
    const maxRetries = this.config.reconnect_retries;
    const retryInterval = this.config.reconnect_interval;

    // Show retry status overlay
    this.showRetryStatus(attempt, maxRetries);

    // Check if daemon is alive
    this.apiClient
      .checkHealth()
      .then((isHealthy) => {
        if (isHealthy) {
          // Daemon is alive, safe to reload
          this.hideRetryStatus();
          location.reload();
        } else {
          throw new Error('Server not healthy');
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
            'サーバーに接続できません。bunterm が起動しているか確認してください。'
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
  // Initialize debug panel if ?debug=1 is in URL
  DebugPanel.init();

  // Setup Sentry error handlers first
  setupSentryErrorHandlers(config);

  // Wait for initTerminalUi() to be called
  // because __TERMINAL_CLIENT__ is not yet available when this script loads
  window.initTerminalUi = () => {
    const app = new ToolbarApp(config);
    app.initialize();
  };
}
