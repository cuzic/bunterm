/**
 * FileOpsSidebar - Side panel for displaying file operations from Claude ToolUse
 *
 * Displays a list of file operations (Read, Edit, Write, Grep, Glob) in a
 * resizable sidebar on the right side of the screen. Clicking items shows
 * the PathLinkManager popup with actions (Preview, Copy, Download).
 *
 * Features:
 * - Real-time operation list as ToolUse events occur
 * - Resizable panel width (stored in localStorage)
 * - Tool-specific icons and colors
 * - Click to show action popup via PathLinkManager
 * - Responsive: hidden on mobile (< 768px)
 */

import type { PathLinkManager } from './PathLinkManager.js';

export interface FileOperation {
  id: string;
  filePath: string;
  toolName: string;
  turnId: string;
  timestamp: Date;
  status: 'pending' | 'complete' | 'error';
}

export interface FileOpsSidebarOptions {
  pathLinkManager: PathLinkManager;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  callbacks?: FileOpsSidebarCallbacks;
}

const STORAGE_KEY = 'bunterm-file-ops-width';
const STORAGE_VISIBLE_KEY = 'bunterm-file-ops-visible';
const MAX_OPERATIONS = 100; // Limit to prevent memory issues

export interface FileOpsSidebarCallbacks {
  /** Called when sidebar visibility changes (for terminal refit) */
  onVisibilityChange?: (visible: boolean) => void;
  /** Called when sidebar width changes (for terminal refit) */
  onWidthChange?: (width: number) => void;
}

export class FileOpsSidebar {
  private operations: FileOperation[] = [];
  private pane: HTMLElement | null = null;
  private listContainer: HTMLElement | null = null;
  private isVisible = false;
  private currentWidth: number;
  private operationCounter = 0;

  private readonly pathLinkManager: PathLinkManager;
  private readonly minWidth: number;
  private readonly maxWidth: number;
  private readonly defaultWidth: number;
  private readonly callbacks: FileOpsSidebarCallbacks;

  // Event listener cleanup
  private cleanupFns: (() => void)[] = [];

  // Item click handlers for cleanup
  private itemClickHandlers: Map<string, { element: HTMLElement; handler: () => void }> = new Map();

  constructor(options: FileOpsSidebarOptions) {
    this.pathLinkManager = options.pathLinkManager;
    this.minWidth = options.minWidth ?? 200;
    this.maxWidth = options.maxWidth ?? 500;
    this.defaultWidth = options.defaultWidth ?? 300;
    this.callbacks = options.callbacks ?? {};

    // Load width from storage
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    this.currentWidth = savedWidth ? Number.parseInt(savedWidth, 10) : this.defaultWidth;
    this.currentWidth = Math.max(this.minWidth, Math.min(this.maxWidth, this.currentWidth));

    // Bind DOM elements
    this.bindElements();

    // Restore visibility state
    const wasVisible = localStorage.getItem(STORAGE_VISIBLE_KEY);
    if (wasVisible === 'true') {
      this.show();
    }
  }

  /**
   * Bind to existing DOM elements
   */
  private bindElements(): void {
    this.pane = document.getElementById('tui-file-ops-pane');
    this.listContainer = document.getElementById('tui-file-ops-list');

    if (!this.pane || !this.listContainer) {
      return;
    }

    // Set initial width on body for CSS variable inheritance
    this.updateWidthCssVar(this.currentWidth);

    // Setup event listeners with cleanup tracking
    const closeBtn = document.getElementById('tui-file-ops-close');
    if (closeBtn) {
      const handler = () => this.hide();
      closeBtn.addEventListener('click', handler);
      this.cleanupFns.push(() => closeBtn.removeEventListener('click', handler));
    }

    const clearBtn = document.getElementById('tui-file-ops-clear');
    if (clearBtn) {
      const handler = () => this.clear();
      clearBtn.addEventListener('click', handler);
      this.cleanupFns.push(() => clearBtn.removeEventListener('click', handler));
    }

    // Setup resizer
    this.setupResizer();
  }

  /**
   * Update CSS variable for width (on body for inheritance)
   */
  private updateWidthCssVar(width: number): void {
    document.body.style.setProperty('--file-ops-width', `${width}px`);
  }

  /**
   * Add a file operation to the list.
   * If the same filePath+toolName already exists, move it to the end (dedup).
   */
  addOperation(op: Omit<FileOperation, 'id' | 'timestamp'>): void {
    // Check for duplicate (same filePath and toolName)
    const existingIndex = this.operations.findIndex(
      (o) => o.filePath === op.filePath && o.toolName === op.toolName
    );

    if (existingIndex !== -1) {
      // Remove existing operation and its DOM element
      const existing = this.operations[existingIndex]!;
      this.operations.splice(existingIndex, 1);
      this.removeItemElement(existing.id);
    }

    const operation: FileOperation = {
      ...op,
      id: `file-op-${++this.operationCounter}`,
      timestamp: new Date()
    };

    this.operations.push(operation);
    this.renderItem(operation);

    // Enforce max operations limit (remove oldest)
    while (this.operations.length > MAX_OPERATIONS) {
      const oldest = this.operations.shift();
      if (oldest) {
        this.removeItemElement(oldest.id);
      }
    }

    // Auto-show sidebar when operations are added
    if (!this.isVisible && this.operations.length === 1) {
      this.show();
    }

    // Scroll to bottom
    if (this.listContainer) {
      this.listContainer.scrollTop = this.listContainer.scrollHeight;
    }
  }

  /**
   * Remove item element and cleanup its event listener
   */
  private removeItemElement(id: string): void {
    const handler = this.itemClickHandlers.get(id);
    if (handler) {
      handler.element.removeEventListener('click', handler.handler);
      handler.element.remove();
      this.itemClickHandlers.delete(id);
    } else {
      // Fallback: just remove from DOM
      const el = this.listContainer?.querySelector(`[data-id="${id}"]`);
      el?.remove();
    }
  }

  /**
   * Update operation status by ID
   */
  updateOperation(id: string, status: FileOperation['status']): void {
    const op = this.operations.find((o) => o.id === id);
    if (op) {
      op.status = status;
      this.updateItemStatus(id, status);
    }
  }

  /**
   * Update operation status by filePath and toolName (most recent match)
   */
  updateOperationByPath(filePath: string, toolName: string, status: FileOperation['status']): void {
    // Find the most recent operation matching filePath and toolName
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i]!;
      if (op.filePath === filePath && op.toolName === toolName) {
        op.status = status;
        this.updateItemStatus(op.id, status);
        return;
      }
    }
  }

  /**
   * Clear all operations
   */
  clear(): void {
    // Cleanup all item click handlers
    for (const { element, handler } of this.itemClickHandlers.values()) {
      element.removeEventListener('click', handler);
    }
    this.itemClickHandlers.clear();

    this.operations = [];
    if (this.listContainer) {
      this.listContainer.innerHTML = '';
    }
  }

  /**
   * Show the sidebar
   */
  show(): void {
    if (!this.pane) return;
    this.pane.classList.remove('hidden');
    this.isVisible = true;
    document.body.classList.add('file-ops-open');
    localStorage.setItem(STORAGE_VISIBLE_KEY, 'true');
    this.callbacks.onVisibilityChange?.(true);
  }

  /**
   * Hide the sidebar
   */
  hide(): void {
    if (!this.pane) return;
    this.pane.classList.add('hidden');
    this.isVisible = false;
    document.body.classList.remove('file-ops-open');
    localStorage.setItem(STORAGE_VISIBLE_KEY, 'false');
    this.callbacks.onVisibilityChange?.(false);
  }

  /**
   * Toggle sidebar visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if sidebar is visible
   */
  get visible(): boolean {
    return this.isVisible;
  }

  /**
   * Get all operations
   */
  getOperations(): FileOperation[] {
    return [...this.operations];
  }

  /**
   * Render a single item to the list
   */
  private renderItem(op: FileOperation): void {
    if (!this.listContainer) return;

    const item = document.createElement('div');
    item.className = 'file-ops-item';
    item.setAttribute('data-id', op.id);
    item.setAttribute('data-tool', op.toolName);
    item.title = `${op.toolName}: ${op.filePath}`; // Tooltip for full path

    const icon = this.getToolIcon(op.toolName);
    const fileName = op.filePath.split('/').pop() || op.filePath;
    const statusClass = op.status === 'pending' ? 'pending' : op.status === 'error' ? 'error' : '';

    item.innerHTML = `
      <span class="file-ops-icon">${icon}</span>
      <div class="file-ops-info">
        <span class="file-ops-filename">${this.escapeHtml(fileName)}</span>
        <span class="file-ops-path">${this.escapeHtml(op.filePath)}</span>
      </div>
      <span class="file-ops-status ${statusClass}"></span>
    `;

    // Click handler to show popup (tracked for cleanup)
    const clickHandler = () => {
      const rect = item.getBoundingClientRect();
      this.pathLinkManager.showPopupForPath(
        op.filePath,
        rect.left - 10,
        rect.top + rect.height / 2
      );
    };
    item.addEventListener('click', clickHandler);
    this.itemClickHandlers.set(op.id, { element: item, handler: clickHandler });

    this.listContainer.appendChild(item);
  }

  /**
   * Update item status indicator
   */
  private updateItemStatus(id: string, status: FileOperation['status']): void {
    const item = this.listContainer?.querySelector(`[data-id="${id}"]`);
    if (!item) return;

    const statusEl = item.querySelector('.file-ops-status');
    if (statusEl) {
      statusEl.className = `file-ops-status ${status === 'pending' ? 'pending' : status === 'error' ? 'error' : ''}`;
    }
  }

  /**
   * Get icon for tool type
   */
  private getToolIcon(toolName: string): string {
    switch (toolName) {
      case 'Read':
        return '\u{1F4D6}'; // 📖
      case 'Edit':
        return '\u{270F}\u{FE0F}'; // ✏️
      case 'Write':
        return '\u{1F4DD}'; // 📝
      case 'Grep':
        return '\u{1F50D}'; // 🔍
      case 'Glob':
        return '\u{1F4C2}'; // 📂
      case 'NotebookEdit':
        return '\u{1F4D3}'; // 📓
      default:
        return '\u{1F4C4}'; // 📄
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Setup resizer drag functionality
   */
  private setupResizer(): void {
    const resizer = document.getElementById('tui-file-ops-resizer');
    if (!resizer || !this.pane) return;

    let startX = 0;
    let startWidth = 0;
    let isDragging = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Calculate new width (resize from left edge)
      const delta = startX - e.clientX;
      let newWidth = startWidth + delta;

      // Clamp to min/max
      newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));

      this.currentWidth = newWidth;
      this.updateWidthCssVar(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save width to localStorage and notify
      localStorage.setItem(STORAGE_KEY, String(this.currentWidth));
      this.callbacks.onWidthChange?.(this.currentWidth);
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startWidth = this.currentWidth;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    };

    resizer.addEventListener('mousedown', onMouseDown);
    this.cleanupFns.push(() => resizer.removeEventListener('mousedown', onMouseDown));

    // Touch support for mobile/tablet
    const onTouchStart = (touchStartEvent: TouchEvent) => {
      if (touchStartEvent.touches.length !== 1) return;
      const touch = touchStartEvent.touches[0];
      if (!touch) return;

      isDragging = true;
      startX = touch.clientX;
      startWidth = this.currentWidth;

      const onTouchMove = (e: TouchEvent) => {
        if (!isDragging || e.touches.length !== 1) return;
        const moveTouch = e.touches[0];
        if (!moveTouch) return;

        const delta = startX - moveTouch.clientX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));

        this.currentWidth = newWidth;
        this.updateWidthCssVar(newWidth);
      };

      const onTouchEnd = () => {
        isDragging = false;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        localStorage.setItem(STORAGE_KEY, String(this.currentWidth));
        this.callbacks.onWidthChange?.(this.currentWidth);
      };

      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', onTouchEnd);
    };

    resizer.addEventListener('touchstart', onTouchStart, { passive: true });
    this.cleanupFns.push(() => resizer.removeEventListener('touchstart', onTouchStart));
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Run all cleanup functions
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];

    this.clear();
    this.hide();

    // Remove CSS variable from body
    document.body.style.removeProperty('--file-ops-width');

    this.pane = null;
    this.listContainer = null;
  }
}

export default FileOpsSidebar;
