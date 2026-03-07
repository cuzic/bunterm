/**
 * BlockRenderer - Renders block UI overlay for native terminal
 *
 * Creates Warp-style block headers with actions for each command block.
 */

import type {
  Block,
  BlockCounts,
  BlockFilter,
  BlockManager,
  SearchResult
} from './BlockManager.js';

export interface BlockRendererOptions {
  blockManager: BlockManager;
  container: HTMLElement;
  terminalElement: HTMLElement;
  onCopyCommand?: (command: string) => void;
  onCopyOutput?: (output: string) => void;
  onFilterBlock?: (blockId: string) => void;
  onSendToAI?: (block: Block) => void;
  onSelectionCopy?: (text: string) => void;
  onRerunCommand?: (command: string) => void;
  onEditAndRerun?: (command: string) => void;
  /** Show filter toolbar by default (default: false) */
  showFilterToolbar?: boolean;
}

// Patterns for potentially dangerous commands
const DANGEROUS_PATTERNS = [
  /\brm\s+(-[rf]+\s+)*\//i, // rm with root path
  /\brm\s+-[rf]*\s+\*/i, // rm with wildcard
  /\bsudo\s+rm\b/i, // sudo rm
  /\bmkfs\b/i, // filesystem format
  /\bdd\s+if=/i, // dd command
  /\b:()\{\s*:\|\:\s*&\s*\};:/i, // fork bomb
  /\bchmod\s+-R\s+777\s+\//i, // chmod 777 root
  />\s*\/dev\/sd/i // write to block device
];

interface BlockElement {
  id: string;
  element: HTMLElement;
  headerElement: HTMLElement;
}

export class BlockRenderer {
  private options: BlockRendererOptions;
  private overlayContainer: HTMLElement | null = null;
  private blockElements: Map<string, BlockElement> = new Map();
  private isVisible = true;
  private resizeObserver: ResizeObserver | null = null;
  private contextMenu: HTMLElement | null = null;
  private filterToolbar: HTMLElement | null = null;
  private searchToolbar: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchResultsLabel: HTMLElement | null = null;
  private sidebar: HTMLElement | null = null;
  private sidebarList: HTMLElement | null = null;

  constructor(options: BlockRendererOptions) {
    this.options = options;
    this.init();
    this.setupKeyboardHandlers();
  }

  /**
   * Initialize the block overlay container
   */
  private init(): void {
    // Create overlay container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'block-overlay-container';
    this.overlayContainer.setAttribute('aria-hidden', 'true');

    // Position overlay over terminal
    this.positionOverlay();

    // Add to container
    this.options.container.appendChild(this.overlayContainer);

    // Create context menu
    this.createContextMenu();

    // Create filter toolbar
    this.createFilterToolbar();

    // Create search toolbar
    this.createSearchToolbar();

    // Create sidebar
    this.createSidebar();

    // Observe terminal size changes
    this.resizeObserver = new ResizeObserver(() => {
      this.positionOverlay();
    });
    this.resizeObserver.observe(this.options.terminalElement);

    // Close context menu on click outside
    document.addEventListener('click', () => this.hideContextMenu());
  }

  /**
   * Setup keyboard handlers for copy shortcuts
   */
  private setupKeyboardHandlers(): void {
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl+C - Copy selection
      if (modKey && e.key === 'c' && !e.shiftKey && !e.altKey) {
        if (this.options.blockManager.selectionCount > 0) {
          e.preventDefault();
          this.copySelection();
        }
      }

      // Cmd/Ctrl+Shift+C - Copy selection as Markdown
      if (modKey && e.shiftKey && e.key === 'C') {
        if (this.options.blockManager.selectionCount > 0) {
          e.preventDefault();
          this.copySelectionAsMarkdown();
        }
      }

      // Cmd/Ctrl+A - Select all blocks
      if (modKey && e.key === 'a' && !e.shiftKey && !e.altKey) {
        if (this.options.blockManager.count > 0 && this.isVisible) {
          e.preventDefault();
          this.options.blockManager.selectAll();
        }
      }

      // Escape - Clear selection and close search
      if (e.key === 'Escape') {
        if (this.isSearchVisible()) {
          this.hideSearch();
        } else {
          this.options.blockManager.clearSelection();
          this.hideContextMenu();
        }
      }

      // Cmd/Ctrl+F - Open block search
      if (modKey && e.key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.showSearch();
      }

      // F3 or Cmd/Ctrl+G - Next search result
      if (e.key === 'F3' || (modKey && e.key === 'g' && !e.shiftKey)) {
        if (this.isSearchVisible() && this.options.blockManager.searchResultCount > 0) {
          e.preventDefault();
          this.options.blockManager.nextSearchResult();
          this.highlightCurrentSearchResult();
        }
      }

      // Shift+F3 or Cmd/Ctrl+Shift+G - Previous search result
      if (
        (e.key === 'F3' && e.shiftKey) ||
        (modKey && e.shiftKey && (e.key === 'g' || e.key === 'G'))
      ) {
        if (this.isSearchVisible() && this.options.blockManager.searchResultCount > 0) {
          e.preventDefault();
          this.options.blockManager.previousSearchResult();
          this.highlightCurrentSearchResult();
        }
      }

      // Cmd/Ctrl+Shift+E - Toggle errors only filter
      if (modKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.options.blockManager.toggleErrorsOnly();
      }

      // Cmd/Ctrl+Shift+T - Toggle filter toolbar
      if (modKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.toggleFilterToolbar();
      }

      // Cmd/Ctrl+↑ - Previous block
      if (modKey && e.key === 'ArrowUp' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.options.blockManager.focusPreviousBlock();
      }

      // Cmd/Ctrl+↓ - Next block
      if (modKey && e.key === 'ArrowDown' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.options.blockManager.focusNextBlock();
      }

      // Cmd/Ctrl+Home - First block
      if (modKey && e.key === 'Home' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.options.blockManager.focusFirstBlock();
      }

      // Cmd/Ctrl+End - Last block
      if (modKey && e.key === 'End' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.options.blockManager.focusLastBlock();
      }

      // Cmd/Ctrl+B - Toggle bookmark on focused block
      if (modKey && e.key === 'b' && !e.shiftKey && !e.altKey) {
        const focusedId = this.options.blockManager.getFocusedBlockId();
        if (focusedId) {
          e.preventDefault();
          this.options.blockManager.toggleBookmark(focusedId);
          this.updateBookmarkState(focusedId);
        }
      }

      // Cmd/Ctrl+Shift+B - Next bookmark
      if (modKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        this.options.blockManager.focusNextBookmark();
      }

      // Cmd/Ctrl+Alt+B - Previous bookmark
      if (modKey && e.altKey && e.key === 'b') {
        e.preventDefault();
        this.options.blockManager.focusPreviousBookmark();
      }

      // Cmd/Ctrl+\ - Toggle sidebar
      if (modKey && e.key === '\\') {
        e.preventDefault();
        this.toggleSidebar();
      }

      // Cmd/Ctrl+Enter - Re-run focused or selected block
      if (modKey && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        this.rerunFocusedOrSelectedBlock();
      }

      // Cmd/Ctrl+Shift+Enter - Edit and re-run
      if (modKey && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        this.editAndRerunBlock();
      }
    });
  }

  /**
   * Check if a command is potentially dangerous
   */
  private isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
  }

  /**
   * Re-run the focused or first selected block
   */
  private rerunFocusedOrSelectedBlock(): void {
    const focusedId = this.options.blockManager.getFocusedBlockId();
    const selectedIds = this.options.blockManager.getSelectedBlockIds();

    const blockId = focusedId ?? selectedIds[0];
    if (!blockId) return;

    const block = this.options.blockManager.getBlock(blockId);
    if (!block) return;

    this.rerunCommand(block.command);
  }

  /**
   * Edit and re-run the focused or first selected block
   */
  private editAndRerunBlock(): void {
    const focusedId = this.options.blockManager.getFocusedBlockId();
    const selectedIds = this.options.blockManager.getSelectedBlockIds();

    const blockId = focusedId ?? selectedIds[0];
    if (!blockId) return;

    const block = this.options.blockManager.getBlock(blockId);
    if (!block) return;

    this.options.onEditAndRerun?.(block.command);
  }

  /**
   * Re-run a command with optional danger confirmation
   */
  private rerunCommand(command: string): void {
    if (this.isDangerousCommand(command)) {
      const confirmed = confirm(
        `This command may be dangerous:\n\n${command}\n\nAre you sure you want to re-run it?`
      );
      if (!confirmed) return;
    }

    this.options.onRerunCommand?.(command);
  }

  /**
   * Create the context menu element
   */
  private createContextMenu(): void {
    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'block-context-menu hidden';

    const items = [
      { label: 'Copy All', icon: '\u2398', action: () => this.copySelection() },
      { label: 'Copy Command', icon: '\u276F', action: () => this.copyCommands() },
      { label: 'Copy Output', icon: '\u2399', action: () => this.copyOutput() },
      { label: 'Copy as Markdown', icon: '\u2193', action: () => this.copySelectionAsMarkdown() }
    ];

    for (const item of items) {
      const menuItem = document.createElement('button');
      menuItem.className = 'block-context-menu-item';
      menuItem.innerHTML = `<span class="menu-icon">${item.icon}</span> ${item.label}`;
      menuItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.action();
        this.hideContextMenu();
      });
      this.contextMenu.appendChild(menuItem);
    }

    document.body.appendChild(this.contextMenu);
  }

  /**
   * Create the filter toolbar element
   */
  private createFilterToolbar(): void {
    this.filterToolbar = document.createElement('div');
    // Hidden by default unless showFilterToolbar option is true
    this.filterToolbar.className = this.options.showFilterToolbar
      ? 'block-filter-toolbar'
      : 'block-filter-toolbar hidden';

    const filters: { filter: BlockFilter; label: string; shortLabel: string }[] = [
      { filter: 'all', label: 'All', shortLabel: 'All' },
      { filter: 'success', label: 'Success', shortLabel: '✓' },
      { filter: 'error', label: 'Errors', shortLabel: '✗' },
      { filter: 'running', label: 'Running', shortLabel: '▶' }
    ];

    for (const { filter, label, shortLabel } of filters) {
      const btn = document.createElement('button');
      btn.className = `block-filter-btn block-filter-${filter}`;
      btn.dataset['filter'] = filter;
      btn.innerHTML = `<span class="filter-icon">${shortLabel}</span><span class="filter-label">${label}</span><span class="filter-count" data-count="${filter}">0</span>`;

      if (filter === 'all') {
        btn.classList.add('active');
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.options.blockManager.setFilter(filter);
      });

      this.filterToolbar.appendChild(btn);
    }

    // Add to document body (fixed position)
    document.body.appendChild(this.filterToolbar);
  }

  /**
   * Create the search toolbar element
   */
  private createSearchToolbar(): void {
    this.searchToolbar = document.createElement('div');
    this.searchToolbar.className = 'block-search-toolbar hidden';

    // Search input
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'block-search-input';
    this.searchInput.placeholder = 'Search in blocks...';
    this.searchInput.addEventListener('input', () => {
      this.performSearch();
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.options.blockManager.previousSearchResult();
        } else {
          this.options.blockManager.nextSearchResult();
        }
        this.highlightCurrentSearchResult();
      }
    });

    // Results count label
    this.searchResultsLabel = document.createElement('span');
    this.searchResultsLabel.className = 'block-search-results';
    this.searchResultsLabel.textContent = '';

    // Navigation buttons
    const prevBtn = document.createElement('button');
    prevBtn.className = 'block-search-btn';
    prevBtn.textContent = '\u25B2'; // ▲
    prevBtn.title = 'Previous result (Shift+Enter)';
    prevBtn.addEventListener('click', () => {
      this.options.blockManager.previousSearchResult();
      this.highlightCurrentSearchResult();
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'block-search-btn';
    nextBtn.textContent = '\u25BC'; // ▼
    nextBtn.title = 'Next result (Enter)';
    nextBtn.addEventListener('click', () => {
      this.options.blockManager.nextSearchResult();
      this.highlightCurrentSearchResult();
    });

    // Options checkboxes
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'block-search-options';

    const caseSensitiveLabel = document.createElement('label');
    caseSensitiveLabel.className = 'block-search-option';
    const caseSensitiveCheck = document.createElement('input');
    caseSensitiveCheck.type = 'checkbox';
    caseSensitiveCheck.id = 'search-case-sensitive';
    caseSensitiveCheck.addEventListener('change', () => this.performSearch());
    caseSensitiveLabel.appendChild(caseSensitiveCheck);
    caseSensitiveLabel.appendChild(document.createTextNode(' Aa'));
    caseSensitiveLabel.title = 'Case sensitive';

    const regexLabel = document.createElement('label');
    regexLabel.className = 'block-search-option';
    const regexCheck = document.createElement('input');
    regexCheck.type = 'checkbox';
    regexCheck.id = 'search-regex';
    regexCheck.addEventListener('change', () => this.performSearch());
    regexLabel.appendChild(regexCheck);
    regexLabel.appendChild(document.createTextNode(' .*'));
    regexLabel.title = 'Regular expression';

    const includeCommandLabel = document.createElement('label');
    includeCommandLabel.className = 'block-search-option';
    const includeCommandCheck = document.createElement('input');
    includeCommandCheck.type = 'checkbox';
    includeCommandCheck.id = 'search-include-command';
    includeCommandCheck.addEventListener('change', () => this.performSearch());
    includeCommandLabel.appendChild(includeCommandCheck);
    includeCommandLabel.appendChild(document.createTextNode(' $'));
    includeCommandLabel.title = 'Include commands';

    optionsDiv.appendChild(caseSensitiveLabel);
    optionsDiv.appendChild(regexLabel);
    optionsDiv.appendChild(includeCommandLabel);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'block-search-close';
    closeBtn.textContent = '\u2715'; // ✕
    closeBtn.title = 'Close search (Escape)';
    closeBtn.addEventListener('click', () => {
      this.hideSearch();
    });

    // Build toolbar
    this.searchToolbar.appendChild(this.searchInput);
    this.searchToolbar.appendChild(this.searchResultsLabel);
    this.searchToolbar.appendChild(prevBtn);
    this.searchToolbar.appendChild(nextBtn);
    this.searchToolbar.appendChild(optionsDiv);
    this.searchToolbar.appendChild(closeBtn);

    document.body.appendChild(this.searchToolbar);
  }

  /**
   * Create the sidebar element
   */
  private createSidebar(): void {
    this.sidebar = document.createElement('div');
    this.sidebar.className = 'block-sidebar hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'block-sidebar-header';

    const title = document.createElement('span');
    title.textContent = 'Blocks';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'block-sidebar-close';
    closeBtn.textContent = '\u2715';
    closeBtn.title = 'Close sidebar (Cmd/Ctrl+\\)';
    closeBtn.addEventListener('click', () => this.hideSidebar());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Filter buttons
    const filterDiv = document.createElement('div');
    filterDiv.className = 'block-sidebar-filters';

    const filterButtons: { filter: string; label: string }[] = [
      { filter: 'all', label: 'All' },
      { filter: 'bookmarked', label: '★' },
      { filter: 'error', label: '✗' }
    ];

    for (const { filter, label } of filterButtons) {
      const btn = document.createElement('button');
      btn.className = `block-sidebar-filter-btn${filter === 'all' ? ' active' : ''}`;
      btn.dataset['filter'] = filter;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        // Update active state
        const buttons = filterDiv.querySelectorAll('.block-sidebar-filter-btn');
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        // Refresh list
        this.refreshSidebarList(filter);
      });
      filterDiv.appendChild(btn);
    }

    // List container
    this.sidebarList = document.createElement('div');
    this.sidebarList.className = 'block-sidebar-list';

    this.sidebar.appendChild(header);
    this.sidebar.appendChild(filterDiv);
    this.sidebar.appendChild(this.sidebarList);

    document.body.appendChild(this.sidebar);
  }

  /**
   * Refresh the sidebar list
   */
  private refreshSidebarList(filter = 'all'): void {
    if (!this.sidebarList) return;

    this.sidebarList.innerHTML = '';

    const options: import('./BlockManager.js').BlockSummaryOptions = {
      maxCommandLength: 40
    };

    if (filter === 'bookmarked') {
      options.bookmarkedOnly = true;
    } else if (filter === 'error') {
      options.filterStatus = 'error';
    }

    const summaries = this.options.blockManager.getBlockSummaries(options);

    if (summaries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'block-sidebar-empty';
      empty.textContent = filter === 'bookmarked' ? 'No bookmarked blocks' : 'No blocks';
      this.sidebarList.appendChild(empty);
      return;
    }

    for (const summary of summaries) {
      const item = document.createElement('div');
      item.className = `block-sidebar-item block-sidebar-${summary.status}`;
      item.dataset['blockId'] = summary.id;

      if (summary.isBookmarked) {
        item.classList.add('bookmarked');
      }

      // Status icon
      const statusIcon = document.createElement('span');
      statusIcon.className = 'block-sidebar-status';
      statusIcon.textContent = this.getStatusIcon(summary.status);

      // Command
      const command = document.createElement('span');
      command.className = 'block-sidebar-command';
      command.textContent = summary.truncatedCommand;
      command.title = summary.command;

      // Duration
      const duration = document.createElement('span');
      duration.className = 'block-sidebar-duration';
      if (summary.durationMs !== undefined) {
        duration.textContent = this.formatDurationMs(summary.durationMs);
      }

      // Bookmark indicator
      if (summary.isBookmarked) {
        const bookmark = document.createElement('span');
        bookmark.className = 'block-sidebar-bookmark';
        bookmark.textContent = '★';
        item.appendChild(bookmark);
      }

      item.appendChild(statusIcon);
      item.appendChild(command);
      item.appendChild(duration);

      // Click to focus block
      item.addEventListener('click', () => {
        this.options.blockManager.focusBlock(summary.id);
        this.hideSidebar();
      });

      this.sidebarList.appendChild(item);
    }
  }

  /**
   * Format duration in ms to human readable
   */
  private formatDurationMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m${seconds}s`;
  }

  /**
   * Show sidebar
   */
  showSidebar(): void {
    if (!this.sidebar) return;
    this.sidebar.classList.remove('hidden');
    this.refreshSidebarList();
  }

  /**
   * Hide sidebar
   */
  hideSidebar(): void {
    this.sidebar?.classList.add('hidden');
  }

  /**
   * Toggle sidebar visibility
   */
  toggleSidebar(): void {
    if (!this.sidebar) return;
    if (this.sidebar.classList.contains('hidden')) {
      this.showSidebar();
    } else {
      this.hideSidebar();
    }
  }

  /**
   * Show search toolbar
   */
  private showSearch(): void {
    if (!this.searchToolbar || !this.searchInput) return;

    this.searchToolbar.classList.remove('hidden');
    this.searchInput.focus();
    this.searchInput.select();
  }

  /**
   * Hide search toolbar
   */
  private hideSearch(): void {
    if (!this.searchToolbar) return;

    this.searchToolbar.classList.add('hidden');
    this.options.blockManager.clearSearch();
    this.clearSearchHighlights();
  }

  /**
   * Check if search is visible
   */
  private isSearchVisible(): boolean {
    return this.searchToolbar !== null && !this.searchToolbar.classList.contains('hidden');
  }

  /**
   * Perform search with current input and options
   */
  private performSearch(): void {
    if (!this.searchInput || !this.searchResultsLabel) return;

    const query = this.searchInput.value;
    const caseSensitive =
      (document.getElementById('search-case-sensitive') as HTMLInputElement)?.checked ?? false;
    const regex = (document.getElementById('search-regex') as HTMLInputElement)?.checked ?? false;
    const includeCommand =
      (document.getElementById('search-include-command') as HTMLInputElement)?.checked ?? false;

    const results = this.options.blockManager.search(query, {
      caseSensitive,
      regex,
      includeCommand
    });

    // Update results label
    if (query) {
      this.searchResultsLabel.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
    } else {
      this.searchResultsLabel.textContent = '';
    }

    // Highlight first result
    this.highlightCurrentSearchResult();
  }

  /**
   * Highlight the current search result
   */
  private highlightCurrentSearchResult(): void {
    // Clear previous highlights
    this.clearSearchHighlights();

    const currentResult = this.options.blockManager.currentSearchResult;
    if (!currentResult) return;

    // Update results label with current position
    if (this.searchResultsLabel) {
      const total = this.options.blockManager.searchResultCount;
      const current = this.options.blockManager.currentSearchResultIndex + 1;
      this.searchResultsLabel.textContent = `${current}/${total}`;
    }

    // Highlight current result's block
    const blockEl = this.blockElements.get(currentResult.blockId);
    if (blockEl) {
      blockEl.element.classList.add('search-highlight');
      blockEl.headerElement.classList.add('search-highlight');

      // Scroll to block
      this.scrollToBlock(blockEl.element);

      // Also focus the block
      this.options.blockManager.focusBlock(currentResult.blockId);
    }
  }

  /**
   * Clear all search highlights
   */
  private clearSearchHighlights(): void {
    for (const [, blockEl] of this.blockElements) {
      blockEl.element.classList.remove('search-highlight');
      blockEl.headerElement.classList.remove('search-highlight');
    }
  }

  /**
   * Update search state (called when results change)
   */
  updateSearchState(_result: SearchResult | null): void {
    this.highlightCurrentSearchResult();
  }

  /**
   * Update bookmark state for a specific block
   */
  updateBookmarkState(blockId: string): void {
    const blockEl = this.blockElements.get(blockId);
    if (!blockEl) return;

    const isBookmarked = this.options.blockManager.isBookmarked(blockId);
    const bookmarkBtn = blockEl.headerElement.querySelector(
      '.block-action-bookmark'
    ) as HTMLButtonElement;

    if (bookmarkBtn) {
      if (isBookmarked) {
        bookmarkBtn.classList.add('active');
        bookmarkBtn.textContent = '\u2605'; // ★ (filled star)
      } else {
        bookmarkBtn.classList.remove('active');
        bookmarkBtn.textContent = '\u2606'; // ☆ (empty star)
      }
    }

    // Also update the block element's class
    if (isBookmarked) {
      blockEl.element.classList.add('bookmarked');
      blockEl.headerElement.classList.add('bookmarked');
    } else {
      blockEl.element.classList.remove('bookmarked');
      blockEl.headerElement.classList.remove('bookmarked');
    }
  }

  /**
   * Update filter toolbar state
   */
  updateFilterState(filter: BlockFilter, counts: BlockCounts): void {
    if (!this.filterToolbar) return;

    // Update active button
    const buttons = Array.from(this.filterToolbar.querySelectorAll('.block-filter-btn'));
    for (const btn of buttons) {
      const btnFilter = (btn as HTMLElement).dataset['filter'];
      if (btnFilter === filter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }

    // Update counts
    const countElements = Array.from(this.filterToolbar.querySelectorAll('.filter-count'));
    for (const el of countElements) {
      const countType = (el as HTMLElement).dataset['count'] as keyof BlockCounts;
      if (countType && counts[countType] !== undefined) {
        el.textContent = String(counts[countType]);
        // Hide count if zero (except for 'all')
        if (counts[countType] === 0 && countType !== 'all') {
          (el as HTMLElement).classList.add('hidden');
        } else {
          (el as HTMLElement).classList.remove('hidden');
        }
      }
    }

    // Update block visibility
    this.updateBlockVisibility();
  }

  /**
   * Update block visibility based on filter
   */
  private updateBlockVisibility(): void {
    for (const [blockId, blockEl] of this.blockElements) {
      const passes = this.options.blockManager.passesFilter(blockId);
      if (passes) {
        blockEl.element.classList.remove('filtered-out');
        blockEl.element.style.display = '';
      } else {
        blockEl.element.classList.add('filtered-out');
        blockEl.element.style.display = 'none';
      }
    }
  }

  /**
   * Update focus state and scroll to focused block
   */
  updateFocusState(focusedBlockId: string | null): void {
    // Update focus visual state for all blocks
    for (const [blockId, blockEl] of this.blockElements) {
      if (blockId === focusedBlockId) {
        blockEl.element.classList.add('focused');
        blockEl.headerElement.classList.add('focused');
      } else {
        blockEl.element.classList.remove('focused');
        blockEl.headerElement.classList.remove('focused');
      }
    }

    // Scroll to focused block if it exists
    if (focusedBlockId) {
      const blockEl = this.blockElements.get(focusedBlockId);
      if (blockEl) {
        this.scrollToBlock(blockEl.element);
      }
    }
  }

  /**
   * Scroll to make a block element visible
   */
  private scrollToBlock(element: HTMLElement): void {
    // Get the block's position
    const rect = element.getBoundingClientRect();
    const containerRect = this.options.container.getBoundingClientRect();

    // Check if block is outside visible area
    if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Show context menu at position
   */
  private showContextMenu(x: number, y: number): void {
    if (!this.contextMenu) return;

    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.remove('hidden');
  }

  /**
   * Hide context menu
   */
  private hideContextMenu(): void {
    this.contextMenu?.classList.add('hidden');
  }

  /**
   * Copy selection to clipboard
   */
  private async copySelection(): Promise<void> {
    const text = await this.options.blockManager.copySelection('plain', true);
    this.options.onSelectionCopy?.(text);
  }

  /**
   * Copy selection as Markdown
   */
  private async copySelectionAsMarkdown(): Promise<void> {
    const text = await this.options.blockManager.copySelection('markdown', true);
    this.options.onSelectionCopy?.(text);
  }

  /**
   * Copy only commands from selection
   */
  private async copyCommands(): Promise<void> {
    const text = await this.options.blockManager.copyCommands();
    this.options.onCopyCommand?.(text);
  }

  /**
   * Copy only output from selection
   */
  private async copyOutput(): Promise<void> {
    const text = await this.options.blockManager.copyOutput();
    this.options.onCopyOutput?.(text);
  }

  /**
   * Position the overlay to match terminal position
   */
  private positionOverlay(): void {
    if (!this.overlayContainer) return;

    const termRect = this.options.terminalElement.getBoundingClientRect();
    const containerRect = this.options.container.getBoundingClientRect();

    this.overlayContainer.style.cssText = `
      position: absolute;
      top: ${termRect.top - containerRect.top}px;
      left: ${termRect.left - containerRect.left}px;
      width: ${termRect.width}px;
      height: ${termRect.height}px;
      pointer-events: none;
      overflow: hidden;
      z-index: 9000;
    `;
  }

  /**
   * Add a block to the UI
   */
  addBlock(block: Block): void {
    if (!this.overlayContainer || !this.isVisible) return;

    // Create block header element
    const blockEl = document.createElement('div');
    blockEl.className = `block-item block-${block.status}`;
    blockEl.dataset['blockId'] = block.id;

    const headerEl = this.createBlockHeader(block);
    blockEl.appendChild(headerEl);

    // Add click handler for selection
    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleBlockClick(block.id, e);
    });

    // Add right-click handler for context menu
    headerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Select block if not already selected
      if (!this.options.blockManager.isSelected(block.id)) {
        this.options.blockManager.selectBlock(block.id);
      }
      this.showContextMenu(e.clientX, e.clientY);
    });

    // Position based on terminal line (will be updated by scroll handler)
    this.positionBlock(blockEl, block.startLine);

    this.overlayContainer.appendChild(blockEl);
    this.blockElements.set(block.id, {
      id: block.id,
      element: blockEl,
      headerElement: headerEl
    });
  }

  /**
   * Handle block click for selection
   */
  private handleBlockClick(blockId: string, e: MouseEvent): void {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    if (e.shiftKey) {
      // Shift+click: range selection
      this.options.blockManager.selectBlockRange(blockId);
    } else if (modKey) {
      // Cmd/Ctrl+click: toggle selection
      this.options.blockManager.toggleBlockSelection(blockId);
    } else {
      // Regular click: single selection
      this.options.blockManager.selectBlock(blockId);
    }
  }

  /**
   * Create the block header element
   */
  private createBlockHeader(block: Block): HTMLElement {
    const header = document.createElement('div');
    header.className = 'block-header';
    header.style.pointerEvents = 'auto';

    // Command display
    const commandSpan = document.createElement('span');
    commandSpan.className = 'block-command';
    commandSpan.textContent = this.truncateCommand(block.command, 60);
    commandSpan.title = block.command;

    // Status indicator
    const statusSpan = document.createElement('span');
    statusSpan.className = `block-status block-status-${block.status}`;
    statusSpan.textContent = this.getStatusIcon(block.status);

    // CWD display (optional)
    const cwdSpan = document.createElement('span');
    cwdSpan.className = 'block-cwd';
    cwdSpan.textContent = block.cwd ? this.shortenPath(block.cwd) : '';
    cwdSpan.title = block.cwd || '';

    // Context info container
    const contextDiv = document.createElement('div');
    contextDiv.className = 'block-context';

    // Exit code badge (only show for non-zero)
    if (block.exitCode !== undefined && block.exitCode !== 0) {
      const exitBadge = document.createElement('span');
      exitBadge.className = 'block-exit-code';
      exitBadge.textContent = `Exit ${block.exitCode}`;
      exitBadge.title = `Exit code: ${block.exitCode}`;
      contextDiv.appendChild(exitBadge);
    }

    // Duration (if block is completed)
    if (block.endedAt) {
      const duration = this.formatDuration(block.startedAt, block.endedAt);
      const durationSpan = document.createElement('span');
      durationSpan.className = 'block-duration';
      durationSpan.textContent = duration;
      durationSpan.title = `Duration: ${duration}`;
      contextDiv.appendChild(durationSpan);
    }

    // Timestamp (relative)
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'block-timestamp';
    timestampSpan.textContent = this.formatRelativeTime(block.startedAt);
    timestampSpan.title = new Date(block.startedAt).toLocaleString();
    contextDiv.appendChild(timestampSpan);

    // Actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'block-actions';

    // Copy command button
    const copyCommandBtn = this.createActionButton('Copy Command', 'copy-cmd', () => {
      this.copyToClipboard(block.command);
      this.options.onCopyCommand?.(block.command);
    });

    // Copy output button
    const copyOutputBtn = this.createActionButton('Copy Output', 'copy-out', () => {
      const output = this.options.blockManager.getDecodedOutput(block.id);
      this.copyToClipboard(output);
      this.options.onCopyOutput?.(output);
    });

    // Filter in block button
    const filterBtn = this.createActionButton('Filter', 'filter', () => {
      this.options.onFilterBlock?.(block.id);
    });

    // Send to AI button
    const aiBtn = this.createActionButton('AI', 'ai', () => {
      this.options.onSendToAI?.(block);
    });

    // Re-run button
    const rerunBtn = this.createActionButton('Re-run', 'rerun', () => {
      this.rerunCommand(block.command);
    });

    // Bookmark button
    const bookmarkBtn = this.createActionButton('Bookmark', 'bookmark', () => {
      this.options.blockManager.toggleBookmark(block.id);
      this.updateBookmarkState(block.id);
    });
    bookmarkBtn.dataset['blockId'] = block.id;
    if (this.options.blockManager.isBookmarked(block.id)) {
      bookmarkBtn.classList.add('active');
    }

    actionsDiv.appendChild(rerunBtn);
    actionsDiv.appendChild(bookmarkBtn);
    actionsDiv.appendChild(copyCommandBtn);
    actionsDiv.appendChild(copyOutputBtn);
    actionsDiv.appendChild(filterBtn);
    actionsDiv.appendChild(aiBtn);

    // Build header
    header.appendChild(statusSpan);
    header.appendChild(commandSpan);
    header.appendChild(cwdSpan);
    header.appendChild(contextDiv);
    header.appendChild(actionsDiv);

    return header;
  }

  /**
   * Format duration between two ISO timestamps
   */
  private formatDuration(startedAt: string, endedAt: string): string {
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    const ms = end - start;

    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Format relative time (e.g., "2 min ago")
   */
  private formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    if (diff < 60000) {
      return 'just now';
    }
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} min ago`;
    }
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }

  /**
   * Create an action button
   */
  private createActionButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `block-action-btn block-action-${icon}`;
    btn.title = label;
    btn.setAttribute('aria-label', label);

    // Use text icons for now (can be replaced with SVG)
    const iconMap: Record<string, string> = {
      rerun: '\u21BB', // ↻
      'copy-cmd': '\u2398', // ⎘
      'copy-out': '\u2399', // ⎙
      filter: '\u2315', // ⌕
      ai: '\u2728', // ✨
      bookmark: '\u2606' // ☆ (empty star, will be ★ when active)
    };
    btn.textContent = iconMap[icon] ?? (icon.charAt(0).toUpperCase() || '?');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });

    return btn;
  }

  /**
   * Update a block (e.g., when it ends)
   */
  updateBlock(block: Block): void {
    const blockEl = this.blockElements.get(block.id);
    if (!blockEl) return;

    // Update status class (preserve selection state)
    const isSelected = this.options.blockManager.isSelected(block.id);
    blockEl.element.className = `block-item block-${block.status}${isSelected ? ' selected' : ''}`;

    // Update status indicator
    const statusSpan = blockEl.headerElement.querySelector('.block-status');
    if (statusSpan) {
      statusSpan.className = `block-status block-status-${block.status}`;
      statusSpan.textContent = this.getStatusIcon(block.status);
    }

    // Update position if endLine is available
    if (block.endLine !== undefined) {
      // Could update to show block end indicator
    }
  }

  /**
   * Update visual selection state for all blocks
   */
  updateSelectionState(selectedIds: string[]): void {
    const selectedSet = new Set(selectedIds);

    for (const [blockId, blockEl] of this.blockElements) {
      const isSelected = selectedSet.has(blockId);
      const block = this.options.blockManager.getBlock(blockId);
      const status = block?.status ?? 'success';

      if (isSelected) {
        blockEl.element.classList.add('selected');
        blockEl.element.className = `block-item block-${status} selected`;
      } else {
        blockEl.element.classList.remove('selected');
        blockEl.element.className = `block-item block-${status}`;
      }
    }
  }

  /**
   * Position a block element based on terminal line
   */
  private positionBlock(element: HTMLElement, line: number): void {
    // Get terminal character height (approximate)
    const termEl = this.options.terminalElement;
    const xtermRows = termEl.querySelector('.xterm-rows') as HTMLElement;

    if (!xtermRows) return;

    // Calculate row height from actual terminal
    const rowEl = xtermRows.querySelector('.xterm-row') as HTMLElement;
    const rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 17;

    // Position at the block's start line
    const top = line * rowHeight;

    element.style.cssText = `
      position: absolute;
      top: ${top}px;
      left: 0;
      right: 0;
      pointer-events: none;
    `;
  }

  /**
   * Handle terminal scroll to update block positions
   */
  handleScroll(_scrollTop: number): void {
    // TODO: Make headers sticky when scrolling past them
    // This is a placeholder - full implementation would track scroll position
    // and update header positions accordingly
  }

  /**
   * Remove a block from the UI
   */
  removeBlock(blockId: string): void {
    const blockEl = this.blockElements.get(blockId);
    if (blockEl) {
      blockEl.element.remove();
      this.blockElements.delete(blockId);
    }
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    for (const [id] of this.blockElements) {
      this.removeBlock(id);
    }
  }

  /**
   * Show/hide the block overlay
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.overlayContainer) {
      this.overlayContainer.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    this.setVisible(!this.isVisible);
  }

  /**
   * Render blocks from block manager
   */
  renderBlocks(blocks: Block[]): void {
    this.clear();
    for (const block of blocks) {
      this.addBlock(block);
    }
  }

  /**
   * Copy text to clipboard
   */
  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return '\u25B6'; // ▶
      case 'success':
        return '\u2713'; // ✓
      case 'error':
        return '\u2717'; // ✗
      default:
        return '\u2022'; // •
    }
  }

  /**
   * Truncate command for display
   */
  private truncateCommand(command: string, maxLength: number): string {
    if (command.length <= maxLength) return command;
    return command.slice(0, maxLength - 3) + '...';
  }

  /**
   * Shorten path for display
   */
  private shortenPath(path: string): string {
    const parts = path.split('/');
    if (parts.length <= 3) return path;
    return '.../' + parts.slice(-2).join('/');
  }

  /**
   * Toggle filter toolbar visibility
   */
  toggleFilterToolbar(): void {
    if (this.filterToolbar) {
      this.filterToolbar.classList.toggle('hidden');
    }
  }

  /**
   * Show filter toolbar
   */
  showFilterToolbar(): void {
    if (this.filterToolbar) {
      this.filterToolbar.classList.remove('hidden');
    }
  }

  /**
   * Hide filter toolbar
   */
  hideFilterToolbar(): void {
    if (this.filterToolbar) {
      this.filterToolbar.classList.add('hidden');
    }
  }

  /**
   * Check if filter toolbar is visible
   */
  isFilterToolbarVisible(): boolean {
    return this.filterToolbar ? !this.filterToolbar.classList.contains('hidden') : false;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.resizeObserver?.disconnect();
    this.overlayContainer?.remove();
    this.contextMenu?.remove();
    this.contextMenu = null;
    this.filterToolbar?.remove();
    this.filterToolbar = null;
    this.searchToolbar?.remove();
    this.searchToolbar = null;
    this.searchInput = null;
    this.searchResultsLabel = null;
    this.sidebar?.remove();
    this.sidebar = null;
    this.sidebarList = null;
    this.blockElements.clear();
  }
}
