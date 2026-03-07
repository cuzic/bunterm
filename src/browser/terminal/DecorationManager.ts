/**
 * DecorationManager - xterm.js Decoration API wrapper
 *
 * Manages visual decorations for blocks in the terminal using xterm.js
 * Decoration API. Creates status icons, action buttons, and overview ruler marks.
 */

import type { IDecoration, IMarker, Terminal } from '@xterm/xterm';

export type BlockType = 'command' | 'claude';
export type BlockStatus = 'running' | 'success' | 'error' | 'streaming';

export interface BlockInfo {
  id: string;
  type: BlockType;
  status: BlockStatus;
  startLine: number;
  command?: string;
  userMessage?: string;
}

interface BlockDecoration {
  blockId: string;
  type: BlockType;
  marker: IMarker;
  statusDecoration: IDecoration | undefined;
  actionDecoration: IDecoration | undefined;
  blockInfo: BlockInfo; // Store for resize handling
  selected: boolean;
}

export interface DecorationManagerOptions {
  terminal: Terminal;
  onBlockClick?: (blockId: string, event: MouseEvent) => void;
  onActionClick?: (blockId: string, action: string, event: MouseEvent) => void;
  onBlockSelect?: (blockId: string, selected: boolean) => void;
}

// Status icons for different block states
const STATUS_ICONS: Record<BlockStatus, string> = {
  running: '\u25B6', // ▶
  success: '\u2713', // ✓
  error: '\u2717', // ✗
  streaming: '\u25D0' // ◐
};

// Status colors
const STATUS_COLORS: Record<BlockStatus, string> = {
  running: '#1565c0',
  success: '#2e7d32',
  error: '#c62828',
  streaming: '#7b1fa2'
};

// Overview ruler colors (slightly more transparent for ruler)
const OVERVIEW_COLORS: Record<BlockType, Record<BlockStatus, string>> = {
  command: {
    running: 'rgba(21, 101, 192, 0.8)',
    success: 'rgba(46, 125, 50, 0.6)',
    error: 'rgba(198, 40, 40, 0.8)',
    streaming: 'rgba(123, 31, 162, 0.8)'
  },
  claude: {
    running: 'rgba(124, 58, 237, 0.8)',
    success: 'rgba(124, 58, 237, 0.6)',
    error: 'rgba(198, 40, 40, 0.8)',
    streaming: 'rgba(168, 85, 247, 0.8)'
  }
};

export class DecorationManager {
  private terminal: Terminal;
  private decorations: Map<string, BlockDecoration> = new Map();
  private options: DecorationManagerOptions;
  private styleElement: HTMLStyleElement | null = null;
  private selectedBlockIds: Set<string> = new Set();

  constructor(options: DecorationManagerOptions) {
    this.terminal = options.terminal;
    this.options = options;
    this.injectStyles();
  }

  /**
   * Inject CSS styles for decorations
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* Block status icon - left side indicator */
      .block-status-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: white;
        border-radius: 2px;
        cursor: pointer;
        width: 100%;
        height: 100%;
        user-select: none;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      }

      .block-status-icon:hover {
        transform: scale(1.15);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      .block-status-icon.selected {
        box-shadow: 0 0 0 2px #fff, 0 0 0 4px #7c3aed;
        transform: scale(1.1);
      }

      .block-status-icon.claude {
        background: linear-gradient(135deg, #7c3aed, #a855f7);
      }

      .block-status-icon.command {
        /* Color set by inline style based on status */
      }

      /* Streaming animation */
      .block-status-icon.streaming {
        animation: pulse 1.5s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      /* Running spinner animation */
      .block-status-icon.running::after {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        border: 2px solid transparent;
        border-top-color: rgba(255, 255, 255, 0.5);
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Action buttons - right side */
      .block-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 3px;
        opacity: 0;
        transition: opacity 0.2s ease;
        height: 100%;
        padding: 0 4px;
        pointer-events: none;
      }

      .block-actions.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .block-action {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(30, 30, 30, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 2px 5px;
        cursor: pointer;
        font-size: 11px;
        color: white;
        line-height: 1;
        transition: background 0.15s ease, transform 0.1s ease;
        min-width: 22px;
        height: 18px;
      }

      .block-action:hover {
        background: rgba(60, 60, 60, 0.95);
        transform: scale(1.05);
      }

      .block-action:active {
        transform: scale(0.95);
      }

      /* Action icons with emoji fallback */
      .block-action[data-action="rerun"] { color: #4caf50; }
      .block-action[data-action="copy"] { color: #2196f3; }
      .block-action[data-action="ai"] { color: #a855f7; }
      .block-action[data-action="context"] { color: #ff9800; }
      .block-action[data-action="search"] { color: #00bcd4; }

      /* Tooltip */
      .block-action[title]:hover::after {
        content: attr(title);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        font-size: 10px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 1000;
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Add decoration for a block
   */
  addBlock(block: BlockInfo): BlockDecoration | null {
    // Remove existing decoration if any
    this.removeBlock(block.id);

    // Create marker at the block's start line
    // xterm.js 5.x uses registerMarker instead of addMarker
    const marker = this.terminal.registerMarker(block.startLine);
    if (!marker) {
      console.warn('[DecorationManager] Failed to create marker for block:', block.id);
      return null;
    }

    // Get overview ruler color based on block type and status
    const overviewColor = OVERVIEW_COLORS[block.type][block.status];

    // Create status decoration (left side)
    const statusDecoration = this.terminal.registerDecoration({
      marker,
      x: 0,
      width: 2,
      overviewRulerOptions: {
        color: overviewColor
      }
    });

    if (statusDecoration) {
      statusDecoration.onRender((element) => {
        this.renderStatusIcon(element, block);
      });
    }

    // Create action decoration (right side)
    const actionDecoration = this.terminal.registerDecoration({
      marker,
      x: this.terminal.cols - 12,
      width: 12
    });

    if (actionDecoration) {
      actionDecoration.onRender((element) => {
        this.renderActionButtons(element, block);
      });
    }

    const decoration: BlockDecoration = {
      blockId: block.id,
      type: block.type,
      marker,
      statusDecoration,
      actionDecoration,
      blockInfo: block,
      selected: this.selectedBlockIds.has(block.id)
    };

    this.decorations.set(block.id, decoration);
    return decoration;
  }

  /**
   * Render status icon element
   */
  private renderStatusIcon(element: HTMLElement, block: BlockInfo): void {
    const isSelected = this.selectedBlockIds.has(block.id);
    const classes = ['block-status-icon', block.type];
    if (isSelected) classes.push('selected');
    if (block.status === 'streaming' || block.status === 'running') {
      classes.push(block.status);
    }

    element.className = classes.join(' ');
    element.innerHTML = block.type === 'claude' ? '\uD83D\uDCAC' : STATUS_ICONS[block.status]; // 💬 for Claude
    element.style.backgroundColor = block.type === 'claude' ? '' : STATUS_COLORS[block.status];
    element.title = this.getStatusTitle(block);

    // Store block id for event handling
    element.dataset['blockId'] = block.id;

    element.onclick = (e) => {
      e.stopPropagation();
      // Cmd/Ctrl+click toggles selection
      if (e.metaKey || e.ctrlKey) {
        this.toggleSelection(block.id);
      } else {
        this.options.onBlockClick?.(block.id, e);
      }
    };

    // Show/hide action buttons on hover
    element.onmouseenter = () => {
      const decoration = this.decorations.get(block.id);
      if (decoration?.actionDecoration?.element) {
        decoration.actionDecoration.element.classList.add('visible');
      }
    };
    element.onmouseleave = () => {
      const decoration = this.decorations.get(block.id);
      if (decoration?.actionDecoration?.element) {
        decoration.actionDecoration.element.classList.remove('visible');
      }
    };
  }

  /**
   * Render action buttons element
   */
  private renderActionButtons(element: HTMLElement, block: BlockInfo): void {
    element.className = 'block-actions';

    const actions =
      block.type === 'claude'
        ? [
            { action: 'copy', icon: '\uD83D\uDCCB', title: 'Copy' }, // 📋
            { action: 'context', icon: '\u2795', title: 'Add to AI Context' }, // ➕
            { action: 'search', icon: '\uD83D\uDD0D', title: 'Search' } // 🔍
          ]
        : [
            { action: 'rerun', icon: '\u25B6', title: 'Re-run' }, // ▶
            { action: 'copy', icon: '\uD83D\uDCCB', title: 'Copy' }, // 📋
            { action: 'ai', icon: '\uD83E\uDD16', title: 'Send to AI' } // 🤖
          ];

    element.innerHTML = actions
      .map(
        (a) =>
          `<button class="block-action" data-action="${a.action}" title="${a.title}">${a.icon}</button>`
      )
      .join('');

    // Attach click handlers
    element.querySelectorAll('.block-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset['action'];
        if (action) {
          this.options.onActionClick?.(block.id, action, e as MouseEvent);
        }
      });
    });
  }

  /**
   * Get tooltip title for status icon
   */
  private getStatusTitle(block: BlockInfo): string {
    if (block.type === 'claude') {
      return `Claude: ${block.userMessage?.slice(0, 50) ?? ''}...`;
    }
    return `${block.command?.slice(0, 50) ?? ''} (${block.status})`;
  }

  /**
   * Update block status
   */
  updateStatus(blockId: string, status: BlockStatus): void {
    const decoration = this.decorations.get(blockId);
    if (!decoration?.statusDecoration?.element) return;

    const element = decoration.statusDecoration.element;

    // Update icon
    element.innerHTML = decoration.type === 'claude' ? '\uD83D\uDCAC' : STATUS_ICONS[status];

    // Update background color for command blocks
    if (decoration.type !== 'claude') {
      element.style.backgroundColor = STATUS_COLORS[status];
    }

    // Update animation classes
    element.classList.remove('running', 'streaming');
    if (status === 'running' || status === 'streaming') {
      element.classList.add(status);
    }

    // Update stored block info
    decoration.blockInfo.status = status;
  }

  /**
   * Toggle block selection
   */
  toggleSelection(blockId: string): void {
    const decoration = this.decorations.get(blockId);
    if (!decoration) return;

    if (this.selectedBlockIds.has(blockId)) {
      this.selectedBlockIds.delete(blockId);
      decoration.selected = false;
      decoration.statusDecoration?.element?.classList.remove('selected');
    } else {
      this.selectedBlockIds.add(blockId);
      decoration.selected = true;
      decoration.statusDecoration?.element?.classList.add('selected');
    }

    this.options.onBlockSelect?.(blockId, decoration.selected);
  }

  /**
   * Select a block (single selection mode)
   */
  selectBlock(blockId: string): void {
    // Clear previous selection
    this.clearSelection();

    // Select new block
    const decoration = this.decorations.get(blockId);
    if (decoration) {
      this.selectedBlockIds.add(blockId);
      decoration.selected = true;
      decoration.statusDecoration?.element?.classList.add('selected');
      this.options.onBlockSelect?.(blockId, true);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    for (const blockId of this.selectedBlockIds) {
      const decoration = this.decorations.get(blockId);
      if (decoration) {
        decoration.selected = false;
        decoration.statusDecoration?.element?.classList.remove('selected');
      }
    }
    this.selectedBlockIds.clear();
  }

  /**
   * Get selected block IDs
   */
  getSelectedBlockIds(): string[] {
    return Array.from(this.selectedBlockIds);
  }

  /**
   * Check if a block is selected
   */
  isSelected(blockId: string): boolean {
    return this.selectedBlockIds.has(blockId);
  }

  /**
   * Remove block decoration
   */
  removeBlock(blockId: string): void {
    const decoration = this.decorations.get(blockId);
    if (!decoration) return;

    decoration.statusDecoration?.dispose();
    decoration.actionDecoration?.dispose();
    decoration.marker.dispose();
    this.decorations.delete(blockId);
    this.selectedBlockIds.delete(blockId);
  }

  /**
   * Clear all decorations
   */
  clear(): void {
    for (const [blockId] of this.decorations) {
      this.removeBlock(blockId);
    }
    this.selectedBlockIds.clear();
  }

  /**
   * Dispose manager and cleanup
   */
  dispose(): void {
    this.clear();
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }

  /**
   * Get decoration by block ID
   */
  getDecoration(blockId: string): BlockDecoration | undefined {
    return this.decorations.get(blockId);
  }

  /**
   * Check if block has decoration
   */
  hasDecoration(blockId: string): boolean {
    return this.decorations.has(blockId);
  }

  /**
   * Get all block IDs
   */
  getAllBlockIds(): string[] {
    return Array.from(this.decorations.keys());
  }

  /**
   * Update action button positions on terminal resize
   */
  handleResize(): void {
    // Collect all block infos before clearing
    const blockInfos: BlockInfo[] = [];
    for (const decoration of this.decorations.values()) {
      blockInfos.push(decoration.blockInfo);
    }

    // Recreate all decorations with new terminal width
    for (const blockInfo of blockInfos) {
      this.addBlock(blockInfo);
    }
  }

  /**
   * Scroll to block
   */
  scrollToBlock(blockId: string): void {
    const decoration = this.decorations.get(blockId);
    if (!decoration) return;

    // Use the marker's line to scroll
    const line = decoration.marker.line;
    if (line !== undefined) {
      this.terminal.scrollToLine(line);
    }
  }
}

// Export for use in terminal-client
export default DecorationManager;
