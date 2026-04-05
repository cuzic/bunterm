/**
 * Clipboard History Manager
 *
 * Manages clipboard history for quick paste operations.
 * Shows history popup on long press of paste button.
 */

import { z } from 'zod';
import { LongPressHandler } from '@/browser/shared/LongPressHandler.js';
import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { ClipboardHistoryItem } from '@/browser/shared/types.js';
import { STORAGE_KEYS } from '@/browser/shared/types.js';
import {
  bindClickScoped,
  generateUniqueId,
  renderEmptyState,
  truncateText
} from '@/browser/shared/utils.js';
import type { InputHandler } from './InputHandler.js';
import { createStorageManager, type StorageManager } from './StorageManager.js';

const MAX_HISTORY_ITEMS = 10;
const LONG_PRESS_DURATION = 500; // ms

// Schema for clipboard history storage
const clipboardHistoryItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  timestamp: z.string()
});

const clipboardHistoryStorageSchema = z.object({
  version: z.number(),
  items: z.array(clipboardHistoryItemSchema)
});

type ClipboardHistoryStorageType = z.infer<typeof clipboardHistoryStorageSchema>;

export class ClipboardHistoryManager implements Mountable {
  private inputHandler: InputHandler;
  private history: ClipboardHistoryItem[] = [];
  private pasteBtn: HTMLButtonElement | null = null;
  private popup: HTMLElement | null = null;
  private longPressHandler: LongPressHandler | null = null;
  private storage: StorageManager<ClipboardHistoryStorageType>;

  constructor(inputHandler: InputHandler) {
    this.inputHandler = inputHandler;
    this.storage = createStorageManager({
      key: STORAGE_KEYS.CLIPBOARD_HISTORY,
      schema: clipboardHistoryStorageSchema,
      defaultValue: { version: 1, items: [] }
    });
    this.load();
  }

  /**
   * Bind paste button (stores reference only)
   */
  bindPasteButton(pasteBtn: HTMLButtonElement): void {
    this.pasteBtn = pasteBtn;
    this.createPopup();
  }

  /**
   * Create the popup element
   */
  private createPopup(): void {
    this.popup = document.createElement('div');
    this.popup.id = 'tui-clipboard-history';
    this.popup.className = 'hidden';
    const header = document.createElement('div');
    header.id = 'tui-clipboard-history-header';

    const headerLabel = document.createElement('span');
    headerLabel.textContent = '履歴';
    header.appendChild(headerLabel);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'tui-clipboard-history-close';
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.id = 'tui-clipboard-history-list';

    this.popup.appendChild(header);
    this.popup.appendChild(list);
    document.body.appendChild(this.popup);
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { pasteBtn, popup } = this;
    if (!pasteBtn || !popup) {
      return;
    }

    // Close button
    const closeBtn = popup.querySelector('#tui-clipboard-history-close') as HTMLButtonElement;
    bindClickScoped(scope, closeBtn, () => this.hidePopup());

    // Close on outside click
    scope.on(document, 'click', (e: Event) => {
      if (this.isPopupVisible() && !popup.contains(e.target as Node) && e.target !== pasteBtn) {
        this.hidePopup();
      }
    });

    // Long press detection using LongPressHandler
    this.longPressHandler = new LongPressHandler({
      element: pasteBtn,
      duration: LONG_PRESS_DURATION,
      onLongPress: () => this.showPopup(),
      onCancel: () => {
        // Reset triggered state after a short delay to allow click handler to check it
        setTimeout(() => this.longPressHandler?.resetTriggered(), 50);
      }
    });
    scope.mount(this.longPressHandler);
  }

  /**
   * Check if long press was triggered
   */
  isLongPressInProgress(): boolean {
    return this.longPressHandler?.isTriggered() ?? false;
  }

  /**
   * Add text to clipboard history
   */
  addToHistory(text: string): void {
    // Don't add empty or duplicate (most recent)
    if (!text.trim()) {
      return;
    }
    if (this.history.length > 0 && this.history[0]?.text === text) {
      return;
    }

    // Add to beginning
    const item: ClipboardHistoryItem = {
      id: this.generateId(),
      text,
      timestamp: new Date().toISOString()
    };

    this.history.unshift(item);

    // Trim to max size
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
    }

    this.save();
  }

  /**
   * Send text from history to terminal
   */
  sendFromHistory(id: string): void {
    const item = this.history.find((h) => h.id === id);
    if (!item) {
      return;
    }

    if (this.inputHandler.sendText(item.text)) {
      this.hidePopup();
    }
  }

  /**
   * Check if popup is visible
   */
  isPopupVisible(): boolean {
    return this.popup ? !this.popup.classList.contains('hidden') : false;
  }

  /**
   * Show the history popup
   */
  showPopup(): void {
    if (!this.popup || !this.pasteBtn) {
      return;
    }

    // Position popup above paste button
    const btnRect = this.pasteBtn.getBoundingClientRect();
    this.popup.style.bottom = `${window.innerHeight - btnRect.top + 8}px`;
    this.popup.style.left = `${Math.max(16, btnRect.left - 100)}px`;

    this.renderList();
    this.popup.classList.remove('hidden');
  }

  /**
   * Hide the history popup
   */
  hidePopup(): void {
    this.popup?.classList.add('hidden');
  }

  /**
   * Render the history list
   */
  private renderList(): void {
    const list = this.popup?.querySelector('#tui-clipboard-history-list');
    if (!list) {
      return;
    }

    if (this.history.length === 0) {
      renderEmptyState(list as HTMLElement, '履歴がありません', {
        id: 'tui-clipboard-history-empty'
      });
      return;
    }

    list.innerHTML = '';

    for (const item of this.history) {
      const el = document.createElement('div');
      el.className = 'tui-clipboard-history-item';
      // Replace newlines with spaces for single-line display
      el.textContent = truncateText(item.text.replace(/\n/g, ' '), 50);
      el.title = item.text;
      // biome-ignore lint: cleaned up via Mountable lifecycle
      el.addEventListener('click', () => this.sendFromHistory(item.id));
      list.appendChild(el);
    }
  }

  /**
   * Load history from storage
   */
  private load(): void {
    const storage = this.storage.load();
    this.history = storage.items;
  }

  /**
   * Save history to storage
   */
  private save(): void {
    this.storage.save({
      version: 1,
      items: this.history
    });
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return generateUniqueId();
  }
}
