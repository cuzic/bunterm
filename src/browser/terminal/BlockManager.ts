/**
 * BlockManager - Client-side block state management
 *
 * Manages the state of command blocks received from the server.
 * Works with BlockRenderer for UI display.
 */

import type { Block, BlockStatus } from '../types.js';

export type { Block, BlockStatus };

export interface BlockEventHandlers {
  onBlockStart?: (block: Block) => void;
  onBlockEnd?: (block: Block) => void;
  onBlockOutput?: (blockId: string, data: string) => void;
  onBlocksLoaded?: (blocks: Block[]) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onFilterChange?: (filter: BlockFilter, counts: BlockCounts) => void;
  onFocusChange?: (blockId: string | null) => void;
  onLongRunning?: (blockId: string) => void;
}

export type CopyFormat = 'plain' | 'markdown';

/** Filter options for blocks */
export type BlockFilter = 'all' | 'success' | 'error' | 'running';

/** Block counts by status */
export interface BlockCounts {
  all: number;
  success: number;
  error: number;
  running: number;
}

/** Search result within a block */
export interface SearchResult {
  blockId: string;
  startIndex: number;
  endIndex: number;
  lineNumber?: number;
  lineContent?: string;
}

/** Search options */
export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  includeCommand?: boolean;
}

/** Block summary for sidebar display */
export interface BlockSummary {
  id: string;
  index: number;
  command: string;
  truncatedCommand: string;
  status: BlockStatus;
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  isBookmarked: boolean;
  bookmarkLabel?: string;
}

/** Options for getting block summaries */
export interface BlockSummaryOptions {
  maxCommandLength?: number;
  filterStatus?: BlockStatus;
  bookmarkedOnly?: boolean;
  limit?: number;
}

/** Detected file path in block output */
export interface FilePath {
  /** The file path string */
  path: string;
  /** Line number if present */
  line?: number;
  /** Column number if present */
  column?: number;
  /** Start index in the output string */
  startIndex: number;
  /** End index in the output string (exclusive) */
  endIndex: number;
}

/** Options for exporting blocks to markdown */
export interface ExportOptions {
  /** Include the working directory */
  includeDirectory?: boolean;
  /** Include timestamp */
  includeTimestamp?: boolean;
  /** Export command only (no output) */
  commandOnly?: boolean;
}

export class BlockManager {
  private blocks: Map<string, Block> = new Map();
  private blockOrder: string[] = [];
  private activeBlockId: string | null = null;
  private handlers: BlockEventHandlers = {};

  // Selection state
  private selectedBlockIds: Set<string> = new Set();
  private lastSelectedId: string | null = null;

  // Filter state
  private currentFilter: BlockFilter = 'all';

  // Focus/navigation state
  private focusedBlockId: string | null = null;

  // Search state
  private searchResults: SearchResult[] = [];
  private currentSearchIndex = 0;

  // Bookmark state
  private bookmarks: Map<string, string | undefined> = new Map(); // blockId -> label

  // Long-running command notification state
  private longRunningThreshold = 30000; // 30 seconds default

  constructor(handlers: BlockEventHandlers = {}) {
    this.handlers = handlers;
  }

  /**
   * Handle a block start message from the server
   */
  handleBlockStart(block: Block): void {
    this.blocks.set(block.id, { ...block });
    this.blockOrder.push(block.id);
    this.activeBlockId = block.id;
    this.handlers.onBlockStart?.(block);
  }

  /**
   * Handle a block end message from the server
   */
  handleBlockEnd(blockId: string, exitCode: number, endedAt: string, endLine: number): void {
    const block = this.blocks.get(blockId);
    if (!block) return;

    block.exitCode = exitCode;
    block.endedAt = endedAt;
    block.endLine = endLine;
    block.status = exitCode === 0 ? 'success' : 'error';

    if (this.activeBlockId === blockId) {
      this.activeBlockId = null;
    }

    this.handlers.onBlockEnd?.(block);
  }

  /**
   * Handle a block output message from the server
   */
  handleBlockOutput(blockId: string, data: string): void {
    const block = this.blocks.get(blockId);
    if (!block) return;

    block.output += data;
    this.handlers.onBlockOutput?.(blockId, data);
  }

  /**
   * Handle a block list message (for reconnection)
   */
  handleBlockList(blocks: Block[]): void {
    // Clear existing blocks and repopulate
    this.blocks.clear();
    this.blockOrder = [];

    for (const block of blocks) {
      this.blocks.set(block.id, { ...block });
      this.blockOrder.push(block.id);

      if (block.status === 'running') {
        this.activeBlockId = block.id;
      }
    }

    this.handlers.onBlocksLoaded?.(blocks);
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): Block | undefined {
    return this.blocks.get(blockId);
  }

  /**
   * Get the active (running) block
   */
  getActiveBlock(): Block | null {
    if (!this.activeBlockId) return null;
    return this.blocks.get(this.activeBlockId) ?? null;
  }

  /**
   * Get all blocks in order
   */
  getAllBlocks(): Block[] {
    return this.blockOrder.map((id) => this.blocks.get(id)!).filter(Boolean);
  }

  /**
   * Get recent blocks
   */
  getRecentBlocks(count = 10): Block[] {
    const startIndex = Math.max(0, this.blockOrder.length - count);
    return this.blockOrder
      .slice(startIndex)
      .map((id) => this.blocks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get decoded output for a block
   */
  getDecodedOutput(blockId: string): string {
    const block = this.blocks.get(blockId);
    if (!block || !block.output) return '';

    try {
      // The output is accumulated as base64 strings concatenated
      // Decode as one piece
      const bytes = Uint8Array.from(atob(block.output), (c) => c.charCodeAt(0));
      const decoder = new TextDecoder('utf-8', { fatal: false });
      return decoder.decode(bytes);
    } catch {
      return '[Unable to decode output]';
    }
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks.clear();
    this.blockOrder = [];
    this.activeBlockId = null;
  }

  /**
   * Get block count
   */
  get count(): number {
    return this.blocks.size;
  }

  /**
   * Check if there's an active block
   */
  get hasActiveBlock(): boolean {
    return this.activeBlockId !== null;
  }

  // === Selection Methods ===

  /**
   * Select a single block (clears previous selection)
   */
  selectBlock(blockId: string): void {
    if (!this.blocks.has(blockId)) return;

    this.selectedBlockIds.clear();
    this.selectedBlockIds.add(blockId);
    this.lastSelectedId = blockId;
    this.handlers.onSelectionChange?.([...this.selectedBlockIds]);
  }

  /**
   * Toggle block selection (add/remove from selection)
   */
  toggleBlockSelection(blockId: string): void {
    if (!this.blocks.has(blockId)) return;

    if (this.selectedBlockIds.has(blockId)) {
      this.selectedBlockIds.delete(blockId);
    } else {
      this.selectedBlockIds.add(blockId);
    }
    this.lastSelectedId = blockId;
    this.handlers.onSelectionChange?.([...this.selectedBlockIds]);
  }

  /**
   * Select a range of blocks (Shift+click behavior)
   */
  selectBlockRange(blockId: string): void {
    if (!this.blocks.has(blockId)) return;

    if (!this.lastSelectedId || !this.blocks.has(this.lastSelectedId)) {
      this.selectBlock(blockId);
      return;
    }

    const startIdx = this.blockOrder.indexOf(this.lastSelectedId);
    const endIdx = this.blockOrder.indexOf(blockId);

    if (startIdx === -1 || endIdx === -1) {
      this.selectBlock(blockId);
      return;
    }

    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);

    for (let i = minIdx; i <= maxIdx; i++) {
      const id = this.blockOrder[i];
      if (id) {
        this.selectedBlockIds.add(id);
      }
    }

    this.handlers.onSelectionChange?.([...this.selectedBlockIds]);
  }

  /**
   * Clear all selection
   */
  clearSelection(): void {
    this.selectedBlockIds.clear();
    this.lastSelectedId = null;
    this.handlers.onSelectionChange?.([]);
  }

  /**
   * Select all blocks
   */
  selectAll(): void {
    this.selectedBlockIds = new Set(this.blockOrder);
    this.handlers.onSelectionChange?.([...this.selectedBlockIds]);
  }

  /**
   * Check if a block is selected
   */
  isSelected(blockId: string): boolean {
    return this.selectedBlockIds.has(blockId);
  }

  /**
   * Get all selected block IDs
   */
  getSelectedBlockIds(): string[] {
    // Return in order
    return this.blockOrder.filter((id) => this.selectedBlockIds.has(id));
  }

  /**
   * Get all selected blocks
   */
  getSelectedBlocks(): Block[] {
    return this.getSelectedBlockIds()
      .map((id) => this.blocks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get the number of selected blocks
   */
  get selectionCount(): number {
    return this.selectedBlockIds.size;
  }

  /**
   * Copy selected blocks to clipboard
   */
  async copySelection(format: CopyFormat = 'plain', includeOutput = true): Promise<string> {
    const selectedBlocks = this.getSelectedBlocks();
    if (selectedBlocks.length === 0) return '';

    let text = '';

    for (const block of selectedBlocks) {
      const output = includeOutput ? this.getDecodedOutput(block.id) : '';

      if (format === 'markdown') {
        text += `\`\`\`bash\n$ ${block.command}\n`;
        if (output) {
          text += output;
          if (!output.endsWith('\n')) text += '\n';
        }
        text += '```\n\n';
      } else {
        text += `$ ${block.command}\n`;
        if (output) {
          text += output;
          if (!output.endsWith('\n')) text += '\n';
        }
        text += '\n';
      }
    }

    await this.copyToClipboard(text.trim());
    return text.trim();
  }

  /**
   * Copy only commands from selected blocks
   */
  async copyCommands(): Promise<string> {
    const selectedBlocks = this.getSelectedBlocks();
    if (selectedBlocks.length === 0) return '';

    const text = selectedBlocks.map((b) => b.command).join('\n');
    await this.copyToClipboard(text);
    return text;
  }

  /**
   * Copy only output from selected blocks
   */
  async copyOutput(): Promise<string> {
    const selectedBlocks = this.getSelectedBlocks();
    if (selectedBlocks.length === 0) return '';

    const outputs = selectedBlocks.map((b) => this.getDecodedOutput(b.id)).filter(Boolean);
    const text = outputs.join('\n');
    await this.copyToClipboard(text);
    return text;
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

  // === Filter Methods ===

  /**
   * Get the current filter
   */
  getFilter(): BlockFilter {
    return this.currentFilter;
  }

  /**
   * Set the filter and notify listeners
   */
  setFilter(filter: BlockFilter): void {
    this.currentFilter = filter;
    this.handlers.onFilterChange?.(filter, this.getCounts());
  }

  /**
   * Toggle to errors only filter (Cmd+Shift+E shortcut)
   */
  toggleErrorsOnly(): void {
    if (this.currentFilter === 'error') {
      this.setFilter('all');
    } else {
      this.setFilter('error');
    }
  }

  /**
   * Get block counts by status
   */
  getCounts(): BlockCounts {
    let success = 0;
    let error = 0;
    let running = 0;

    for (const block of this.blocks.values()) {
      switch (block.status) {
        case 'success':
          success++;
          break;
        case 'error':
          error++;
          break;
        case 'running':
          running++;
          break;
      }
    }

    return {
      all: this.blocks.size,
      success,
      error,
      running
    };
  }

  /**
   * Check if a block passes the current filter
   */
  passesFilter(blockId: string): boolean {
    if (this.currentFilter === 'all') {
      return true;
    }

    const block = this.blocks.get(blockId);
    if (!block) {
      return false;
    }

    return block.status === this.currentFilter;
  }

  /**
   * Get all blocks that pass the current filter
   */
  getFilteredBlocks(): Block[] {
    if (this.currentFilter === 'all') {
      return this.getAllBlocks();
    }

    return this.blockOrder
      .map((id) => this.blocks.get(id))
      .filter((b): b is Block => b !== undefined && b.status === this.currentFilter);
  }

  /**
   * Get filtered block IDs
   */
  getFilteredBlockIds(): string[] {
    if (this.currentFilter === 'all') {
      return [...this.blockOrder];
    }

    return this.blockOrder.filter((id) => {
      const block = this.blocks.get(id);
      return block && block.status === this.currentFilter;
    });
  }

  // === Navigation Methods ===

  /**
   * Get the currently focused block ID
   */
  getFocusedBlockId(): string | null {
    return this.focusedBlockId;
  }

  /**
   * Set focus to a specific block
   */
  focusBlock(blockId: string | null): void {
    if (blockId && !this.blocks.has(blockId)) {
      return;
    }
    this.focusedBlockId = blockId;
    this.handlers.onFocusChange?.(blockId);
  }

  /**
   * Clear focus
   */
  clearFocus(): void {
    this.focusedBlockId = null;
    this.handlers.onFocusChange?.(null);
  }

  /**
   * Navigate to the previous block (respects current filter)
   */
  focusPreviousBlock(): void {
    const filteredIds = this.getFilteredBlockIds();
    if (filteredIds.length === 0) return;

    if (!this.focusedBlockId) {
      // Focus the last block
      this.focusBlock(filteredIds[filteredIds.length - 1] ?? null);
      return;
    }

    const currentIdx = filteredIds.indexOf(this.focusedBlockId);
    if (currentIdx === -1) {
      // Current focus not in filtered list, focus last
      this.focusBlock(filteredIds[filteredIds.length - 1] ?? null);
    } else if (currentIdx > 0) {
      // Move to previous
      this.focusBlock(filteredIds[currentIdx - 1] ?? null);
    }
    // At first block, do nothing
  }

  /**
   * Navigate to the next block (respects current filter)
   */
  focusNextBlock(): void {
    const filteredIds = this.getFilteredBlockIds();
    if (filteredIds.length === 0) return;

    if (!this.focusedBlockId) {
      // Focus the first block
      this.focusBlock(filteredIds[0] ?? null);
      return;
    }

    const currentIdx = filteredIds.indexOf(this.focusedBlockId);
    if (currentIdx === -1) {
      // Current focus not in filtered list, focus first
      this.focusBlock(filteredIds[0] ?? null);
    } else if (currentIdx < filteredIds.length - 1) {
      // Move to next
      this.focusBlock(filteredIds[currentIdx + 1] ?? null);
    }
    // At last block, do nothing
  }

  /**
   * Navigate to the first block (respects current filter)
   */
  focusFirstBlock(): void {
    const filteredIds = this.getFilteredBlockIds();
    if (filteredIds.length > 0) {
      this.focusBlock(filteredIds[0] ?? null);
    }
  }

  /**
   * Navigate to the last block (respects current filter)
   */
  focusLastBlock(): void {
    const filteredIds = this.getFilteredBlockIds();
    if (filteredIds.length > 0) {
      this.focusBlock(filteredIds[filteredIds.length - 1] ?? null);
    }
  }

  /**
   * Check if a block is focused
   */
  isFocused(blockId: string): boolean {
    return this.focusedBlockId === blockId;
  }

  // === Search Methods ===

  /**
   * Search for text in block outputs (and optionally commands)
   */
  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { caseSensitive = false, regex = false, includeCommand = false } = options;

    this.searchResults = [];
    this.currentSearchIndex = 0;

    if (!query) {
      return this.searchResults;
    }

    let pattern: RegExp;
    try {
      if (regex) {
        pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
      } else {
        // Escape special regex characters for literal search
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
      }
    } catch {
      // Invalid regex
      return this.searchResults;
    }

    for (const blockId of this.blockOrder) {
      const block = this.blocks.get(blockId);
      if (!block) {
        continue;
      }

      // Search in command if requested
      if (includeCommand && block.command) {
        const commandMatches = [...block.command.matchAll(pattern)];
        for (const match of commandMatches) {
          this.searchResults.push({
            blockId,
            startIndex: match.index ?? 0,
            endIndex: (match.index ?? 0) + match[0].length
          });
        }
      }

      // Search in output
      const output = this.getDecodedOutput(blockId);
      if (output) {
        const lines = output.split('\n');
        let charIndex = 0;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum] ?? '';
          const lineMatches = [...line.matchAll(pattern)];

          for (const match of lineMatches) {
            this.searchResults.push({
              blockId,
              startIndex: charIndex + (match.index ?? 0),
              endIndex: charIndex + (match.index ?? 0) + match[0].length,
              lineNumber: lineNum + 1,
              lineContent: line
            });
          }

          charIndex += line.length + 1; // +1 for newline
        }
      }
    }

    return this.searchResults;
  }

  /**
   * Get the number of search results
   */
  get searchResultCount(): number {
    return this.searchResults.length;
  }

  /**
   * Get the current search result
   */
  get currentSearchResult(): SearchResult | null {
    if (this.searchResults.length === 0) {
      return null;
    }
    return this.searchResults[this.currentSearchIndex] ?? null;
  }

  /**
   * Get the current search result index (0-based)
   */
  get currentSearchResultIndex(): number {
    return this.currentSearchIndex;
  }

  /**
   * Navigate to the next search result (wraps around)
   */
  nextSearchResult(): void {
    if (this.searchResults.length === 0) {
      return;
    }
    this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
  }

  /**
   * Navigate to the previous search result (wraps around)
   */
  previousSearchResult(): void {
    if (this.searchResults.length === 0) {
      return;
    }
    this.currentSearchIndex =
      (this.currentSearchIndex - 1 + this.searchResults.length) % this.searchResults.length;
  }

  /**
   * Clear search results
   */
  clearSearch(): void {
    this.searchResults = [];
    this.currentSearchIndex = 0;
  }

  /**
   * Get all blocks that have search matches
   */
  getBlocksMatchingSearch(): Block[] {
    const matchingBlockIds = new Set(this.searchResults.map((r) => r.blockId));
    return this.blockOrder
      .filter((id) => matchingBlockIds.has(id))
      .map((id) => this.blocks.get(id)!)
      .filter(Boolean);
  }

  // === Bookmark Methods ===

  /**
   * Bookmark a block with optional label
   */
  bookmarkBlock(blockId: string, label?: string): void {
    if (!this.blocks.has(blockId)) {
      return;
    }
    this.bookmarks.set(blockId, label);
  }

  /**
   * Remove bookmark from a block
   */
  unbookmarkBlock(blockId: string): void {
    this.bookmarks.delete(blockId);
  }

  /**
   * Toggle bookmark on a block
   */
  toggleBookmark(blockId: string, label?: string): void {
    if (this.bookmarks.has(blockId)) {
      this.bookmarks.delete(blockId);
    } else {
      this.bookmarkBlock(blockId, label);
    }
  }

  /**
   * Check if a block is bookmarked
   */
  isBookmarked(blockId: string): boolean {
    return this.bookmarks.has(blockId);
  }

  /**
   * Get the label for a bookmarked block
   */
  getBookmarkLabel(blockId: string): string | undefined {
    return this.bookmarks.get(blockId);
  }

  /**
   * Set or update the label for a bookmarked block
   */
  setBookmarkLabel(blockId: string, label: string): void {
    if (this.bookmarks.has(blockId)) {
      this.bookmarks.set(blockId, label);
    }
  }

  /**
   * Get all bookmarked block IDs in order
   */
  getBookmarkedBlockIds(): string[] {
    return this.blockOrder.filter((id) => this.bookmarks.has(id));
  }

  /**
   * Get all bookmarked blocks in order
   */
  getBookmarkedBlocks(): Block[] {
    return this.getBookmarkedBlockIds()
      .map((id) => this.blocks.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get the number of bookmarked blocks
   */
  get bookmarkCount(): number {
    return this.bookmarks.size;
  }

  /**
   * Clear all bookmarks
   */
  clearBookmarks(): void {
    this.bookmarks.clear();
  }

  /**
   * Navigate to the next bookmarked block (wraps around)
   */
  focusNextBookmark(): void {
    const bookmarkedIds = this.getBookmarkedBlockIds();
    if (bookmarkedIds.length === 0) {
      return;
    }

    if (!this.focusedBlockId) {
      // Focus the first bookmarked block
      this.focusBlock(bookmarkedIds[0] ?? null);
      return;
    }

    const currentIdx = bookmarkedIds.indexOf(this.focusedBlockId);
    if (currentIdx === -1) {
      // Current focus is not bookmarked, find next bookmark after it
      const currentOrderIdx = this.blockOrder.indexOf(this.focusedBlockId);
      const nextBookmarkId = bookmarkedIds.find((id) => {
        const orderIdx = this.blockOrder.indexOf(id);
        return orderIdx > currentOrderIdx;
      });
      this.focusBlock(nextBookmarkId ?? bookmarkedIds[0] ?? null);
    } else {
      // Move to next bookmark (wrap around)
      const nextIdx = (currentIdx + 1) % bookmarkedIds.length;
      this.focusBlock(bookmarkedIds[nextIdx] ?? null);
    }
  }

  /**
   * Navigate to the previous bookmarked block (wraps around)
   */
  focusPreviousBookmark(): void {
    const bookmarkedIds = this.getBookmarkedBlockIds();
    if (bookmarkedIds.length === 0) {
      return;
    }

    if (!this.focusedBlockId) {
      // Focus the last bookmarked block
      this.focusBlock(bookmarkedIds[bookmarkedIds.length - 1] ?? null);
      return;
    }

    const currentIdx = bookmarkedIds.indexOf(this.focusedBlockId);
    if (currentIdx === -1) {
      // Current focus is not bookmarked, find previous bookmark before it
      const currentOrderIdx = this.blockOrder.indexOf(this.focusedBlockId);
      const prevBookmarkId = [...bookmarkedIds].reverse().find((id) => {
        const orderIdx = this.blockOrder.indexOf(id);
        return orderIdx < currentOrderIdx;
      });
      this.focusBlock(prevBookmarkId ?? bookmarkedIds[bookmarkedIds.length - 1] ?? null);
    } else {
      // Move to previous bookmark (wrap around)
      const prevIdx = (currentIdx - 1 + bookmarkedIds.length) % bookmarkedIds.length;
      this.focusBlock(bookmarkedIds[prevIdx] ?? null);
    }
  }

  // === Block Summary Methods (for Sidebar) ===

  /**
   * Get block summaries for sidebar display
   */
  getBlockSummaries(options: BlockSummaryOptions = {}): BlockSummary[] {
    const { maxCommandLength = 50, filterStatus, bookmarkedOnly = false, limit } = options;

    let blockIds = [...this.blockOrder];

    // Apply filters
    if (filterStatus) {
      blockIds = blockIds.filter((id) => {
        const block = this.blocks.get(id);
        return block && block.status === filterStatus;
      });
    }

    if (bookmarkedOnly) {
      blockIds = blockIds.filter((id) => this.bookmarks.has(id));
    }

    // Apply limit (from the end, i.e., most recent)
    if (limit && limit > 0 && blockIds.length > limit) {
      blockIds = blockIds.slice(-limit);
    }

    // Build summaries
    return blockIds.map((id) => {
      const block = this.blocks.get(id)!;
      const originalIndex = this.blockOrder.indexOf(id);

      // Calculate duration
      let durationMs: number | undefined;
      if (block.endedAt) {
        const start = new Date(block.startedAt).getTime();
        const end = new Date(block.endedAt).getTime();
        durationMs = end - start;
      }

      // Truncate command
      let truncatedCommand = block.command;
      if (block.command.length > maxCommandLength) {
        truncatedCommand = block.command.slice(0, maxCommandLength) + '...';
      }

      return {
        id: block.id,
        index: originalIndex,
        command: block.command,
        truncatedCommand,
        status: block.status,
        exitCode: block.exitCode,
        startedAt: block.startedAt,
        endedAt: block.endedAt,
        durationMs,
        isBookmarked: this.bookmarks.has(id),
        bookmarkLabel: this.bookmarks.get(id)
      };
    });
  }

  /**
   * Extract file paths from a block's output
   * Detects paths with optional line:column numbers
   */
  extractFilePaths(blockId: string): FilePath[] {
    const block = this.blocks.get(blockId);
    if (!block) {
      return [];
    }

    const output = this.getDecodedOutput(blockId);
    const results: FilePath[] = [];

    // Regex patterns for file paths
    // Matches:
    // - Absolute paths: /path/to/file.ext
    // - Relative paths: ./path/to/file.ext, ../path/to/file.ext, path/to/file.ext
    // - With optional line:column: file.ext:10 or file.ext:10:5
    // Excludes URLs (http://, https://) and email addresses (contains @)
    const filePathPattern =
      /(?:^|[\s"'(,])((\.\.?\/)?[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?::(\d+)(?::(\d+))?)?(?=[\s"'),]|$)/gm;

    let match: RegExpExecArray | null;
    while ((match = filePathPattern.exec(output)) !== null) {
      const fullMatch = match[0];
      const pathStr = match[1];
      const lineStr = match[3];
      const columnStr = match[4];

      // Skip if no path captured
      if (!pathStr) {
        continue;
      }

      // Skip if it looks like a URL (preceded by protocol)
      const precedingText = output.slice(Math.max(0, match.index - 10), match.index);
      if (/https?:\/\/$/.test(precedingText) || /https?:$/.test(precedingText)) {
        continue;
      }

      // Skip if path contains @ (likely email)
      if (pathStr.includes('@')) {
        continue;
      }

      // Skip if no extension or doesn't look like a file path
      const pathParts = pathStr.split('/');
      const fileName = pathParts[pathParts.length - 1] ?? '';
      if (!fileName.includes('.')) {
        continue;
      }

      // Calculate actual start index (skip leading whitespace/quotes from match)
      const leadingChars = fullMatch.length - fullMatch.trimStart().length;
      const actualStartIndex = match.index + leadingChars;

      // Calculate end index (path + optional :line:col)
      let pathEnd = pathStr;
      if (lineStr) {
        pathEnd += ':' + lineStr;
        if (columnStr) {
          pathEnd += ':' + columnStr;
        }
      }
      const endIndex = actualStartIndex + pathEnd.length;

      results.push({
        path: pathStr,
        line: lineStr ? Number.parseInt(lineStr, 10) : undefined,
        column: columnStr ? Number.parseInt(columnStr, 10) : undefined,
        startIndex: actualStartIndex,
        endIndex
      });
    }

    return results;
  }

  /**
   * Export a single block to markdown format
   */
  exportBlockToMarkdown(blockId: string, options: ExportOptions = {}): string {
    const block = this.blocks.get(blockId);
    if (!block) {
      return '';
    }

    const { includeDirectory = false, includeTimestamp = false, commandOnly = false } = options;
    const lines: string[] = [];

    // Add directory if requested
    if (includeDirectory && block.cwd) {
      lines.push(`📁 ${block.cwd}`);
      lines.push('');
    }

    // Add timestamp if requested
    if (includeTimestamp) {
      const date = new Date(block.startedAt);
      lines.push(`🕐 ${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)}`);
      lines.push('');
    }

    // Add command
    lines.push('```bash');
    lines.push(block.command);
    lines.push('```');

    // Add output if not command-only
    if (!commandOnly) {
      const output = this.getDecodedOutput(blockId).trim();
      if (output) {
        lines.push('');
        lines.push('Output:');
        lines.push('```');
        lines.push(output);
        lines.push('```');
      }

      // Add exit code for non-zero exits
      if (block.exitCode !== undefined && block.exitCode !== 0) {
        lines.push('');
        lines.push(`Exit code: ${block.exitCode}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export multiple blocks to markdown format
   */
  exportBlocksToMarkdown(blockIds: string[], options: ExportOptions = {}): string {
    const markdowns: string[] = [];
    for (const id of blockIds) {
      const md = this.exportBlockToMarkdown(id, options);
      if (md) {
        markdowns.push(md);
      }
    }
    return markdowns.join('\n\n---\n\n');
  }

  /**
   * Export all blocks to markdown format
   */
  exportAllBlocksToMarkdown(options: ExportOptions = {}): string {
    return this.exportBlocksToMarkdown(this.blockOrder, options);
  }

  /**
   * Export selected blocks to markdown format
   */
  exportSelectedBlocksToMarkdown(options: ExportOptions = {}): string {
    const selectedIds = Array.from(this.selectedBlockIds);
    return this.exportBlocksToMarkdown(selectedIds, options);
  }

  /**
   * Get the running duration for a block in milliseconds
   * For running blocks, returns time since start
   * For completed blocks, returns total duration
   */
  getBlockRunningDuration(blockId: string): number | undefined {
    const block = this.blocks.get(blockId);
    if (!block) {
      return undefined;
    }

    const startTime = new Date(block.startedAt).getTime();

    if (block.endedAt) {
      // Completed block - return total duration
      const endTime = new Date(block.endedAt).getTime();
      return endTime - startTime;
    }

    // Running block - return time since start
    return Date.now() - startTime;
  }

  /**
   * Set the threshold for long-running command notifications
   */
  setLongRunningThreshold(thresholdMs: number): void {
    this.longRunningThreshold = thresholdMs;
  }

  /**
   * Get the current long-running threshold
   */
  getLongRunningThreshold(): number {
    return this.longRunningThreshold;
  }

  /**
   * Get blocks that have been running longer than the threshold
   */
  getLongRunningBlocks(): Block[] {
    const longRunning: Block[] = [];
    const now = Date.now();

    for (const [, block] of this.blocks) {
      // Only check running blocks
      if (block.status !== 'running' || block.endedAt) {
        continue;
      }

      const startTime = new Date(block.startedAt).getTime();
      const duration = now - startTime;

      if (duration >= this.longRunningThreshold) {
        longRunning.push(block);
      }
    }

    return longRunning;
  }

  /**
   * Get all currently running blocks
   */
  getRunningBlocks(): Block[] {
    return Array.from(this.blocks.values()).filter(
      (block) => block.status === 'running' && !block.endedAt
    );
  }

  /**
   * Format a duration in milliseconds to a human-readable string
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${seconds}s`;
  }
}
