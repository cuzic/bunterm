/**
 * Selection Handle Manager
 *
 * Manages selection handles for mobile text selection.
 * Shows draggable handles at the start and end of selection
 * to allow fine-tuning of selected text.
 */

import { toolbarEvents } from '@/browser/shared/events.js';
import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { Terminal } from '@/browser/shared/types.js';

interface SelectionPosition {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export class SelectionHandleManager implements Mountable {
  private terminal: Terminal | null = null;
  private container: HTMLElement | null = null;
  private startHandle: HTMLElement | null = null;
  private endHandle: HTMLElement | null = null;
  private copyBtn: HTMLElement | null = null;

  private selection: SelectionPosition | null = null;
  private activeHandle: 'start' | 'end' | null = null;
  private handleOffset = { x: 0, y: 0 };

  // URL pattern for detection (covers http, https, and common URL characters)
  private static readonly URL_SCHEMES = /^https?:\/\//i;
  // Valid URL characters (RFC 3986 + common extras)
  private static readonly URL_CHARS = /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
  // URL pattern for validation
  private static readonly URL_PATTERN = /^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/i;

  /**
   * Bind DOM elements
   */
  bindElements(
    container: HTMLElement,
    startHandle: HTMLElement,
    endHandle: HTMLElement,
    copyBtn: HTMLElement
  ): void {
    this.container = container;
    this.startHandle = startHandle;
    this.endHandle = endHandle;
    this.copyBtn = copyBtn;
  }

  /**
   * Set terminal reference
   */
  setTerminal(terminal: Terminal): void {
    this.terminal = terminal;
  }

  /**
   * Mount event handlers
   */
  mount(scope: Scope): void {
    // Start handle touch events
    if (this.startHandle) {
      scope.on(
        this.startHandle,
        'touchstart',
        (e) => this.onHandleTouchStart(e as TouchEvent, 'start'),
        { passive: false }
      );
    }

    // End handle touch events
    if (this.endHandle) {
      scope.on(
        this.endHandle,
        'touchstart',
        (e) => this.onHandleTouchStart(e as TouchEvent, 'end'),
        { passive: false }
      );
    }

    // Document-level touch events for handle dragging
    scope.on(document, 'touchmove', (e) => this.onHandleTouchMove(e as TouchEvent), {
      passive: false
    });
    scope.on(document, 'touchend', (e) => this.onHandleTouchEnd(e as TouchEvent));

    // Copy button
    if (this.copyBtn) {
      scope.on(this.copyBtn, 'click', () => {
        this.copySelection();
      });
    }

    // Hide handles when clicking outside terminal
    scope.on(document, 'touchstart', (e) => {
      const target = e.target as HTMLElement;
      // Don't hide if touching handles, copy button, or terminal
      if (
        this.container?.classList.contains('hidden') ||
        target.closest('#tui-selection-handles') ||
        target.closest('#tui-selection-copy-btn') ||
        target.closest('.xterm')
      ) {
        return;
      }
      this.hide();
    });

    // Listen for Escape key to hide
    scope.on(document, 'keydown', (e) => {
      if (
        (e as KeyboardEvent).key === 'Escape' &&
        !this.container?.classList.contains('hidden')
      ) {
        this.hide();
      }
    });
  }

  /**
   * Show handles for current terminal selection
   * If selection is part of a URL, auto-expand to full URL boundaries
   */
  show(): void {
    if (!this.terminal || !this.container) {
      return;
    }

    // Get selection from terminal
    const selectionRange = this.getSelectionRange();
    if (!selectionRange) {
      this.hide();
      return;
    }

    this.selection = selectionRange;

    // Try to expand selection to URL boundaries
    const urlBoundaries = this.findUrlBoundaries();
    if (urlBoundaries) {
      this.selection = urlBoundaries;
      // Apply expanded selection to terminal for visual feedback
      this.applySelection();
    }

    this.container.classList.remove('hidden');
    this.copyBtn?.classList.remove('hidden');
    this.updateHandlePositions();
  }

  /**
   * Hide handles and copy button
   */
  hide(): void {
    this.container?.classList.add('hidden');
    this.copyBtn?.classList.add('hidden');
    this.selection = null;
    this.terminal?.clearSelection();
  }

  /**
   * Check if handles are visible
   */
  isVisible(): boolean {
    return !this.container?.classList.contains('hidden');
  }

  /**
   * Get current selection range from terminal
   */
  private getSelectionRange(): SelectionPosition | null {
    if (!this.terminal?.getSelectionPosition) {
      return null;
    }

    const pos = this.terminal.getSelectionPosition();
    if (!pos) {
      return null;
    }

    return {
      startRow: pos.start.y,
      startCol: pos.start.x,
      endRow: pos.end.y,
      endCol: pos.end.x
    };
  }

  /**
   * Update handle positions based on selection
   */
  private updateHandlePositions(): void {
    if (!this.selection || !this.terminal || !this.startHandle || !this.endHandle) {
      return;
    }

    const termEl = this.terminal.element;
    if (!termEl) {
      return;
    }

    const cellDims = this.getCellDimensions();
    if (!cellDims) {
      return;
    }

    const termRect = termEl.getBoundingClientRect();
    const scrollOffset = this.terminal.buffer?.active?.viewportY ?? 0;

    // Calculate start handle position (left side of first character)
    const startX = termRect.left + this.selection.startCol * cellDims.width;
    const startY = termRect.top + (this.selection.startRow - scrollOffset + 1) * cellDims.height;

    // Calculate end handle position (right side of last character)
    const endX = termRect.left + this.selection.endCol * cellDims.width;
    const endY = termRect.top + (this.selection.endRow - scrollOffset + 1) * cellDims.height;

    // Position handles
    this.startHandle.style.left = `${startX - 12}px`; // Center handle on position
    this.startHandle.style.top = `${startY}px`;
    this.endHandle.style.left = `${endX - 12}px`;
    this.endHandle.style.top = `${endY}px`;

    // Position copy button above the end handle
    if (this.copyBtn) {
      const copyBtnX = Math.max(60, Math.min(endX, window.innerWidth - 60));
      const copyBtnY = Math.max(40, endY - 40);
      this.copyBtn.style.left = `${copyBtnX}px`;
      this.copyBtn.style.top = `${copyBtnY}px`;
    }
  }

  /**
   * Get cell dimensions from terminal
   */
  private getCellDimensions(): { width: number; height: number } | null {
    if (!this.terminal) {
      return null;
    }

    // Try to get dimensions from terminal
    const term = this.terminal as Terminal & {
      _core?: {
        _renderService?: {
          dimensions?: {
            css?: { cell: { width: number; height: number } };
          };
        };
      };
    };

    const dims = term._core?._renderService?.dimensions?.css?.cell;
    if (dims) {
      return dims;
    }

    // Fallback: estimate from font size
    const fontSize = this.terminal.options?.fontSize ?? 14;
    return {
      width: fontSize * 0.6,
      height: fontSize * 1.2
    };
  }

  /**
   * Handle touch start on a handle
   */
  private onHandleTouchStart(e: TouchEvent, handle: 'start' | 'end'): void {
    e.preventDefault();
    e.stopPropagation();

    this.activeHandle = handle;
    const touch = e.touches[0];
    const handleEl = handle === 'start' ? this.startHandle : this.endHandle;

    if (handleEl) {
      const rect = handleEl.getBoundingClientRect();
      this.handleOffset = {
        x: touch.clientX - rect.left - rect.width / 2,
        y: touch.clientY - rect.top - rect.height / 2
      };
    }
  }

  /**
   * Handle touch move for dragging
   */
  private onHandleTouchMove(e: TouchEvent): void {
    if (!this.activeHandle || !this.terminal || !this.selection) {
      return;
    }

    e.preventDefault();
    const touch = e.touches[0];
    const pos = this.screenToCell(
      touch.clientX - this.handleOffset.x,
      touch.clientY - this.handleOffset.y
    );

    if (!pos) {
      return;
    }

    // Update selection based on which handle is being dragged
    if (this.activeHandle === 'start') {
      // Ensure start doesn't go past end
      if (
        pos.row < this.selection.endRow ||
        (pos.row === this.selection.endRow && pos.col < this.selection.endCol)
      ) {
        this.selection.startRow = pos.row;
        this.selection.startCol = pos.col;
      }
    } else {
      // Ensure end doesn't go before start
      if (
        pos.row > this.selection.startRow ||
        (pos.row === this.selection.startRow && pos.col > this.selection.startCol)
      ) {
        this.selection.endRow = pos.row;
        this.selection.endCol = pos.col;
      }
    }

    // Update terminal selection
    this.applySelection();
    this.updateHandlePositions();
  }

  /**
   * Handle touch end
   */
  private onHandleTouchEnd(_e: TouchEvent): void {
    this.activeHandle = null;
  }

  /**
   * Convert screen coordinates to terminal cell position
   */
  private screenToCell(x: number, y: number): { row: number; col: number } | null {
    if (!this.terminal) {
      return null;
    }

    const termEl = this.terminal.element;
    if (!termEl) {
      return null;
    }

    const cellDims = this.getCellDimensions();
    if (!cellDims) {
      return null;
    }

    const termRect = termEl.getBoundingClientRect();
    const scrollOffset = this.terminal.buffer?.active?.viewportY ?? 0;

    const col = Math.round((x - termRect.left) / cellDims.width);
    const row = Math.floor((y - termRect.top) / cellDims.height) + scrollOffset;

    // Clamp to valid range
    const cols = this.terminal.cols ?? 80;
    const rows = (this.terminal.buffer?.active?.length ?? 24) - 1;

    return {
      col: Math.max(0, Math.min(cols, col)),
      row: Math.max(0, Math.min(rows, row))
    };
  }

  /**
   * Apply current selection to terminal
   */
  private applySelection(): void {
    if (!this.terminal || !this.selection) {
      return;
    }

    // xterm.js select() method: select(column, row, length)
    // For multi-line selection, we need to use selectLines or calculate length
    const term = this.terminal as Terminal & {
      selectLines?: (start: number, end: number) => void;
      select?: (column: number, row: number, length: number) => void;
    };

    if (this.selection.startRow === this.selection.endRow) {
      // Single line selection
      const length = this.selection.endCol - this.selection.startCol;
      if (term.select && length > 0) {
        term.select(this.selection.startCol, this.selection.startRow, length);
      }
    } else if (term.selectLines) {
      // Multi-line selection
      term.selectLines(this.selection.startRow, this.selection.endRow);
    }
  }

  /**
   * Copy selection to clipboard
   * If selection is a URL, clean whitespace/newlines before copying
   */
  private async copySelection(): Promise<void> {
    if (!this.terminal) {
      return;
    }

    let selection = this.terminal.getSelection();
    if (!selection) {
      return;
    }

    // Clean whitespace if it looks like a URL
    const cleaned = this.cleanWhitespace(selection);
    if (this.isValidUrl(cleaned)) {
      selection = cleaned;
    }

    try {
      await navigator.clipboard.writeText(selection);
      toolbarEvents.emit('toast:show', { message: 'Copied!', type: 'success' });
    } catch (err) {
      toolbarEvents.emit('toast:show', { message: 'Copy failed', type: 'error' });
    }

    this.hide();
  }

  /**
   * Find URL boundaries in terminal buffer around current selection
   * Returns expanded selection if URL found, null otherwise
   */
  private findUrlBoundaries(): SelectionPosition | null {
    if (!this.terminal || !this.selection) {
      return null;
    }

    // Get text around the selection (expand search area)
    const buffer = this.terminal.buffer?.active;
    if (!buffer) {
      return null;
    }

    // Get the selected text first
    const selectedText = this.terminal.getSelection() ?? '';
    const cleanedSelected = this.cleanWhitespace(selectedText);

    // Check if selection already contains URL-like text
    if (!cleanedSelected.includes('://') && !cleanedSelected.includes('http')) {
      // Check surrounding context for URL
      const contextText = this.getTextInRange(
        { row: this.selection.startRow, col: 0 },
        { row: this.selection.endRow, col: this.terminal.cols ?? 80 }
      );

      if (!contextText.includes('://')) {
        return null;
      }
    }

    // Search backwards from selection start for URL scheme
    let urlStartRow = this.selection.startRow;
    let urlStartCol = this.selection.startCol;
    let foundScheme = false;

    // Look for 'http://' or 'https://' starting position
    for (
      let row = this.selection.startRow;
      row >= Math.max(0, this.selection.startRow - 5);
      row--
    ) {
      const line = buffer.getLine(row);
      if (!line) continue;

      const lineText = line.translateToString(false);
      const searchStart =
        row === this.selection.startRow ? this.selection.startCol : lineText.length;

      // Search for scheme in this line
      const httpIndex = lineText.lastIndexOf('http://', searchStart);
      const httpsIndex = lineText.lastIndexOf('https://', searchStart);
      const schemeIndex = Math.max(httpIndex, httpsIndex);

      if (schemeIndex >= 0) {
        urlStartRow = row;
        urlStartCol = schemeIndex;
        foundScheme = true;
        break;
      }
    }

    if (!foundScheme) {
      return null;
    }

    // Search forwards from selection end for URL termination
    let urlEndRow = this.selection.endRow;
    let urlEndCol = this.selection.endCol;

    // Look for end of URL (whitespace or invalid URL character)
    for (
      let row = this.selection.endRow;
      row <= Math.min(buffer.length - 1, this.selection.endRow + 5);
      row++
    ) {
      const line = buffer.getLine(row);
      if (!line) continue;

      const lineText = line.translateToString(false);
      const searchStart = row === this.selection.endRow ? this.selection.endCol : 0;

      // Find first non-URL character
      for (let col = searchStart; col < lineText.length; col++) {
        const char = lineText[col];
        // Stop at whitespace or control characters
        if (/\s/.test(char) || char.charCodeAt(0) < 32) {
          urlEndRow = row;
          urlEndCol = col;
          // Validate the found URL
          const urlText = this.getTextInRange(
            { row: urlStartRow, col: urlStartCol },
            { row: urlEndRow, col: urlEndCol }
          );
          const cleanUrl = this.cleanWhitespace(urlText);
          if (this.isValidUrl(cleanUrl)) {
            return {
              startRow: urlStartRow,
              startCol: urlStartCol,
              endRow: urlEndRow,
              endCol: urlEndCol
            };
          }
          return null;
        }
      }

      // Continue to next line if no terminator found
      urlEndRow = row;
      urlEndCol = lineText.length;
    }

    // Validate the found URL
    const urlText = this.getTextInRange(
      { row: urlStartRow, col: urlStartCol },
      { row: urlEndRow, col: urlEndCol }
    );
    const cleanUrl = this.cleanWhitespace(urlText);

    if (this.isValidUrl(cleanUrl)) {
      return {
        startRow: urlStartRow,
        startCol: urlStartCol,
        endRow: urlEndRow,
        endCol: urlEndCol
      };
    }

    return null;
  }

  /**
   * Get text from terminal buffer for given range
   */
  private getTextInRange(
    start: { row: number; col: number },
    end: { row: number; col: number }
  ): string {
    if (!this.terminal) {
      return '';
    }

    const buffer = this.terminal.buffer?.active;
    if (!buffer) {
      return '';
    }

    const lines: string[] = [];

    for (let row = start.row; row <= end.row; row++) {
      const line = buffer.getLine(row);
      if (!line) continue;

      const lineText = line.translateToString(false);
      const startCol = row === start.row ? start.col : 0;
      const endCol = row === end.row ? end.col : lineText.length;

      lines.push(lineText.substring(startCol, endCol));
    }

    return lines.join('\n');
  }

  /**
   * Remove whitespace and newlines from text
   */
  private cleanWhitespace(text: string): string {
    return text.replace(/\s+/g, '');
  }

  /**
   * Check if text is a valid URL
   */
  private isValidUrl(text: string): boolean {
    return SelectionHandleManager.URL_PATTERN.test(text);
  }
}
