/**
 * Clipboard History Manager
 *
 * Manages clipboard history for quick paste operations.
 * Shows history popup on long press of paste button.
 */

import { LongPressHandler } from '@/browser/shared/LongPressHandler.js';
import type { Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { ClipboardHistoryItem } from '@/browser/shared/types.js';
import { STORAGE_KEYS } from '@/browser/shared/types.js';
import { bindClickScoped, generateUniqueId } from '@/browser/shared/utils.js';
import { z } from 'zod';
import type { InputHandler } from './InputHandler.js';
import { type StorageManager, createStorageManager } from './StorageManager.js';

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
    this.popup.innerHTML = `
      <div id="tui-clipboard-history-header">
        <span>履歴</span>
        <button id="tui-clipboard-history-close">×</button>
      </div>
      <div id="tui-clipboard-history-list"></div>
    `;
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
    if (this.history.length > 0 && this.history[0].text === text) {
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

    list.innerHTML = '';

    if (this.history.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'tui-clipboard-history-empty';
      empty.textContent = '履歴がありません';
      list.appendChild(empty);
      return;
    }

    for (const item of this.history) {
      const el = document.createElement('div');
      el.className = 'tui-clipboard-history-item';
      el.textContent = this.truncateText(item.text, 50);
      el.title = item.text;
      el.addEventListener('click', () => this.sendFromHistory(item.id));
      list.appendChild(el);
    }
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    const singleLine = text.replace(/\n/g, ' ');
    if (singleLine.length <= maxLength) {
      return singleLine;
    }
    return `${singleLine.slice(0, maxLength - 3)}...`;
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
