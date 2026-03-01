/**
 * Snippet Manager
 *
 * Manages command snippets for quick terminal input.
 * Provides CRUD operations with localStorage persistence.
 */

import { z } from 'zod';
import type { InputHandler } from './InputHandler.js';
import { type StorageManager, createStorageManager } from './StorageManager.js';
import type { Snippet, SnippetElements } from './types.js';
import { STORAGE_KEYS } from './types.js';

// Schema for snippet storage
const snippetSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  createdAt: z.string()
});

const snippetStorageSchema = z.object({
  version: z.number(),
  snippets: z.array(snippetSchema)
});

type SnippetStorageType = z.infer<typeof snippetStorageSchema>;

// Current storage version for migration
const STORAGE_VERSION = 1;

export class SnippetManager {
  private inputHandler: InputHandler;
  private snippets: Snippet[] = [];
  private elements: SnippetElements | null = null;
  private searchQuery = '';
  private storage: StorageManager<SnippetStorageType>;

  constructor(inputHandler: InputHandler) {
    this.inputHandler = inputHandler;
    this.storage = createStorageManager({
      key: STORAGE_KEYS.SNIPPETS,
      schema: snippetStorageSchema,
      defaultValue: { version: 1, snippets: [] }
    });
    this.load();
  }

  /**
   * Bind modal elements and setup event listeners
   */
  bindElements(
    snippetBtn: HTMLButtonElement,
    modal: HTMLElement,
    modalClose: HTMLButtonElement,
    addBtn: HTMLButtonElement,
    importBtn: HTMLButtonElement,
    exportBtn: HTMLButtonElement,
    searchInput: HTMLInputElement,
    list: HTMLElement,
    addForm: HTMLElement,
    addNameInput: HTMLInputElement,
    addCommandInput: HTMLTextAreaElement,
    addSaveBtn: HTMLButtonElement,
    addCancelBtn: HTMLButtonElement
  ): void {
    this.elements = {
      snippetBtn,
      modal,
      modalClose,
      addBtn,
      importBtn,
      exportBtn,
      searchInput,
      list,
      addForm,
      addNameInput,
      addCommandInput,
      addSaveBtn,
      addCancelBtn
    };

    this.setupEventListeners();
    this.renderList();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.elements) {
      return;
    }

    // Open modal
    this.elements.snippetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.show();
    });

    // Close modal
    this.elements.modalClose.addEventListener('click', (e) => {
      e.preventDefault();
      this.hide();
    });

    // Close on backdrop click
    this.elements.modal.addEventListener('click', (e) => {
      if (e.target === this.elements?.modal) {
        this.hide();
      }
    });

    // Show add form
    this.elements.addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAddForm();
    });

    // Import
    this.elements.importBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.importSnippets();
    });

    // Export
    this.elements.exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.exportSnippets();
    });

    // Search
    this.elements.searchInput.addEventListener('input', () => {
      this.searchQuery = this.elements?.searchInput.value.trim().toLowerCase() || '';
      this.renderList();
    });

    // Save new snippet
    this.elements.addSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveNewSnippet();
    });

    // Cancel add
    this.elements.addCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.hideAddForm();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });

    // Handle Enter in add form
    this.elements.addNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.elements?.addCommandInput.focus();
      }
    });

    this.elements.addCommandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        this.saveNewSnippet();
      }
    });
  }

  /**
   * Check if modal is visible
   */
  isVisible(): boolean {
    return this.elements?.modal ? !this.elements.modal.classList.contains('hidden') : false;
  }

  /**
   * Show the snippet modal
   */
  show(): void {
    if (!this.elements) {
      return;
    }
    this.elements.modal.classList.remove('hidden');
    this.hideAddForm();
    this.searchQuery = '';
    this.elements.searchInput.value = '';
    this.renderList();
  }

  /**
   * Hide the snippet modal
   */
  hide(): void {
    if (!this.elements) {
      return;
    }
    this.elements.modal.classList.add('hidden');
    this.hideAddForm();
  }

  /**
   * Show add snippet form
   */
  private showAddForm(): void {
    if (!this.elements) {
      return;
    }
    this.elements.addForm.classList.remove('hidden');
    this.elements.addNameInput.value = '';
    this.elements.addCommandInput.value = '';
    this.elements.addNameInput.focus();
  }

  /**
   * Hide add snippet form
   */
  private hideAddForm(): void {
    if (!this.elements) {
      return;
    }
    this.elements.addForm.classList.add('hidden');
    this.elements.addNameInput.value = '';
    this.elements.addCommandInput.value = '';
  }

  /**
   * Save new snippet from form
   */
  private saveNewSnippet(): void {
    if (!this.elements) {
      return;
    }

    const name = this.elements.addNameInput.value.trim();
    const command = this.elements.addCommandInput.value.trim();

    if (!name || !command) {
      return;
    }

    this.addSnippet(name, command);
    this.hideAddForm();
    this.renderList();
  }

  /**
   * Add a new snippet
   */
  addSnippet(name: string, command: string): void {
    const snippet: Snippet = {
      id: this.generateId(),
      name,
      command,
      createdAt: new Date().toISOString()
    };

    this.snippets.push(snippet);
    this.save();
  }

  /**
   * Update an existing snippet
   */
  updateSnippet(id: string, name: string, command: string): void {
    const snippet = this.snippets.find((s) => s.id === id);
    if (!snippet) {
      return;
    }

    snippet.name = name;
    snippet.command = command;
    this.save();
    this.renderList();
  }

  /**
   * Run a snippet by ID
   */
  runSnippet(id: string): void {
    const snippet = this.snippets.find((s) => s.id === id);
    if (!snippet) {
      return;
    }

    if (this.inputHandler.sendText(snippet.command)) {
      this.hide();
    }
  }

  /**
   * Delete a snippet by ID
   */
  deleteSnippet(id: string): void {
    const index = this.snippets.findIndex((s) => s.id === id);
    if (index === -1) {
      return;
    }

    const _snippet = this.snippets[index];
    this.snippets.splice(index, 1);
    this.save();
    this.renderList();
  }

  /**
   * Get all snippets
   */
  getSnippets(): Snippet[] {
    return [...this.snippets];
  }

  /**
   * Filter snippets by search query
   */
  private getFilteredSnippets(): Snippet[] {
    if (!this.searchQuery) {
      return this.snippets;
    }

    return this.snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(this.searchQuery) ||
        s.command.toLowerCase().includes(this.searchQuery)
    );
  }

  /**
   * Import snippets from JSON file
   */
  private importSnippets(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text) as SnippetStorageType;

        if (!data.snippets || !Array.isArray(data.snippets)) {
          throw new Error('Invalid snippet file format');
        }

        // Validate and import snippets
        let importedCount = 0;
        for (const snippet of data.snippets) {
          if (snippet.name && snippet.command) {
            this.addSnippet(snippet.name, snippet.command);
            importedCount++;
          }
        }

        this.renderList();
        alert(`${importedCount} 件のスニペットをインポートしました`);
      } catch (_err) {
        alert('スニペットのインポートに失敗しました');
      }
    };

    input.click();
  }

  /**
   * Export snippets to JSON file
   */
  private exportSnippets(): void {
    if (this.snippets.length === 0) {
      alert('エクスポートするスニペットがありません');
      return;
    }

    const storage: SnippetStorageType = {
      version: STORAGE_VERSION,
      snippets: this.snippets
    };

    const json = JSON.stringify(storage, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ttyd-mux-snippets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Load snippets from localStorage
   */
  private load(): void {
    const storage = this.storage.load();
    this.snippets = storage.snippets;
  }

  /**
   * Save snippets to storage
   */
  private save(): void {
    this.storage.save({
      version: 1,
      snippets: this.snippets
    });
  }

  /**
   * Render the snippet list
   */
  private renderList(): void {
    if (!this.elements) {
      return;
    }

    const { list } = this.elements;
    const empty = document.getElementById('tui-snippet-empty');

    // Clear existing items
    list.innerHTML = '';

    const filteredSnippets = this.getFilteredSnippets();

    if (filteredSnippets.length === 0) {
      if (this.searchQuery) {
        // Show search-specific empty message
        empty?.classList.add('hidden');
        const noResults = document.createElement('div');
        noResults.id = 'tui-snippet-no-results';
        noResults.style.cssText =
          'text-align: center; color: #888; padding: 24px; font-size: 14px;';
        noResults.textContent = '検索結果がありません';
        list.appendChild(noResults);
      } else {
        empty?.classList.remove('hidden');
      }
      return;
    }

    empty?.classList.add('hidden');

    // Render each snippet (newest first)
    const sortedSnippets = [...filteredSnippets].reverse();
    for (const snippet of sortedSnippets) {
      const item = this.createSnippetElement(snippet);
      list.appendChild(item);
    }
  }

  /**
   * Create a snippet item element
   */
  private createSnippetElement(snippet: Snippet): HTMLElement {
    const item = document.createElement('div');
    item.className = 'tui-snippet-item';
    item.dataset.id = snippet.id;

    const header = document.createElement('div');
    header.className = 'tui-snippet-item-header';

    const name = document.createElement('span');
    name.className = 'tui-snippet-item-name';
    name.textContent = snippet.name;

    const actions = document.createElement('div');
    actions.className = 'tui-snippet-item-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'tui-snippet-item-run';
    runBtn.textContent = '\u25B6'; // ▶
    runBtn.title = '実行';
    runBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.runSnippet(snippet.id);
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'tui-snippet-item-edit';
    editBtn.textContent = '\u270E'; // ✎
    editBtn.title = '編集';
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.showEditForm(item, snippet);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tui-snippet-item-delete';
    deleteBtn.textContent = '\uD83D\uDDD1'; // 🗑
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm(`「${snippet.name}」を削除しますか？`)) {
        this.deleteSnippet(snippet.id);
      }
    });

    actions.appendChild(runBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(name);
    header.appendChild(actions);

    const command = document.createElement('div');
    command.className = 'tui-snippet-item-command';
    command.textContent = snippet.command;

    // Create edit form (hidden by default)
    const editForm = this.createEditForm(item, snippet);

    item.appendChild(header);
    item.appendChild(command);
    item.appendChild(editForm);

    return item;
  }

  /**
   * Create edit form for a snippet item
   */
  private createEditForm(item: HTMLElement, snippet: Snippet): HTMLElement {
    const form = document.createElement('div');
    form.className = 'tui-snippet-item-edit-form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = snippet.name;
    nameInput.placeholder = '名前';

    const commandInput = document.createElement('textarea');
    commandInput.value = snippet.command;
    commandInput.placeholder = 'コマンド';
    commandInput.rows = 2;

    const buttons = document.createElement('div');
    buttons.className = 'tui-snippet-item-edit-buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'tui-snippet-item-edit-save';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const newName = nameInput.value.trim();
      const newCommand = commandInput.value.trim();
      if (newName && newCommand) {
        this.updateSnippet(snippet.id, newName, newCommand);
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      item.classList.remove('editing');
    });

    buttons.appendChild(saveBtn);
    buttons.appendChild(cancelBtn);

    form.appendChild(nameInput);
    form.appendChild(commandInput);
    form.appendChild(buttons);

    // Handle Ctrl+Enter to save
    commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        saveBtn.click();
      }
    });

    return form;
  }

  /**
   * Show edit form for a snippet item
   */
  private showEditForm(item: HTMLElement, snippet: Snippet): void {
    // Close any other editing items
    const editingItems = document.querySelectorAll('.tui-snippet-item.editing');
    editingItems.forEach((el) => el.classList.remove('editing'));

    // Open edit form for this item
    item.classList.add('editing');

    // Focus the name input
    const nameInput = item.querySelector('.tui-snippet-item-edit-form input') as HTMLInputElement;
    if (nameInput) {
      nameInput.value = snippet.name;
      nameInput.focus();
    }

    const commandInput = item.querySelector(
      '.tui-snippet-item-edit-form textarea'
    ) as HTMLTextAreaElement;
    if (commandInput) {
      commandInput.value = snippet.command;
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
