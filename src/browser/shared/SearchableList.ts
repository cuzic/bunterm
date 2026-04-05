/**
 * SearchableList
 *
 * Generic searchable list component with keyboard navigation.
 * Implements Mountable for automatic cleanup via Scope.
 *
 * Features:
 * - Text filtering with configurable filter function
 * - Keyboard navigation (Arrow Up/Down, Enter)
 * - Optional wrap-around navigation
 * - Event delegation for list clicks
 */

import type { Mountable, Scope } from './lifecycle.js';

/** Configuration for SearchableList */
export interface SearchableListConfig<T> {
  /** Search input element */
  searchInput: HTMLInputElement;
  /** List container element */
  listContainer: HTMLElement;
  /** Function to get all items */
  getItems: () => T[];
  /** Filter function - returns true if item matches query */
  filter: (item: T, query: string) => boolean;
  /** Render function - renders filtered items to container */
  render: (items: T[], selectedIndex: number, container: HTMLElement) => void;
  /** Select callback - called when item is selected */
  onSelect: (item: T, index: number) => void;
  /** Optional: wrap navigation at list boundaries (default: false) */
  wrapNavigation?: boolean;
  /** Optional: selector for clickable items (default: '[data-index]') */
  itemSelector?: string;
  /** Optional: callback when selection changes */
  onSelectionChange?: (index: number) => void;
}

/**
 * Generic searchable list with keyboard navigation.
 * Use as a composable helper within modal managers.
 */
export class SearchableList<T> implements Mountable {
  private config: SearchableListConfig<T>;
  private _filteredItems: T[] = [];
  private _selectedIndex = 0;
  private _query = '';

  constructor(config: SearchableListConfig<T>) {
    this.config = config;
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { searchInput, listContainer } = this.config;

    // Search input event
    scope.on(searchInput, 'input', () => {
      this._query = searchInput.value.toLowerCase().trim();
      this._selectedIndex = 0;
      this.refresh();
    });

    // Keyboard navigation
    scope.on(searchInput, 'keydown', (e: Event) => {
      this.handleKeydown(e as KeyboardEvent);
    });

    // Event delegation for list clicks
    const itemSelector = this.config.itemSelector ?? '[data-index]';
    scope.on(listContainer, 'click', (e: Event) => {
      const target = (e.target as HTMLElement).closest(itemSelector) as HTMLElement | null;
      if (!target) {
        return;
      }

      const indexStr = target.getAttribute('data-index');
      if (indexStr === null) {
        return;
      }

      const index = Number.parseInt(indexStr, 10);
      const item = this._filteredItems[index];
      if (
        !Number.isNaN(index) &&
        index >= 0 &&
        index < this._filteredItems.length &&
        item !== undefined
      ) {
        this.config.onSelect(item, index);
      }
    });
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        this.selectNext();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        this.selectPrevious();
        break;
      }
      case 'Enter': {
        e.preventDefault();
        this.selectCurrent();
        break;
      }
    }
  }

  /**
   * Select next item
   */
  private selectNext(): void {
    if (this._filteredItems.length === 0) {
      return;
    }

    const wrap = this.config.wrapNavigation ?? false;
    const newIndex = this._selectedIndex + 1;

    if (newIndex >= this._filteredItems.length) {
      this._selectedIndex = wrap ? 0 : this._filteredItems.length - 1;
    } else {
      this._selectedIndex = newIndex;
    }

    this.render();
    this.config.onSelectionChange?.(this._selectedIndex);
    this.scrollToSelected();
  }

  /**
   * Select previous item
   */
  private selectPrevious(): void {
    if (this._filteredItems.length === 0) {
      return;
    }

    const wrap = this.config.wrapNavigation ?? false;
    const newIndex = this._selectedIndex - 1;

    if (newIndex < 0) {
      this._selectedIndex = wrap ? this._filteredItems.length - 1 : 0;
    } else {
      this._selectedIndex = newIndex;
    }

    this.render();
    this.config.onSelectionChange?.(this._selectedIndex);
    this.scrollToSelected();
  }

  /**
   * Select current item
   */
  private selectCurrent(): void {
    const item = this._filteredItems[this._selectedIndex];
    if (
      this._filteredItems.length > 0 &&
      this._selectedIndex < this._filteredItems.length &&
      item !== undefined
    ) {
      this.config.onSelect(item, this._selectedIndex);
    }
  }

  /**
   * Scroll to keep selected item visible
   */
  private scrollToSelected(): void {
    const itemSelector = this.config.itemSelector ?? '[data-index]';
    const selectedEl = this.config.listContainer.querySelector(
      `${itemSelector}[data-index="${this._selectedIndex}"]`
    );
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Refresh the list (filter and render)
   */
  refresh(): void {
    this.filter();
    this.render();
  }

  /**
   * Filter items based on current query
   */
  private filter(): void {
    const allItems = this.config.getItems();
    if (this._query) {
      this._filteredItems = allItems.filter((item) => this.config.filter(item, this._query));
    } else {
      this._filteredItems = [...allItems];
    }

    // Clamp selected index
    if (this._selectedIndex >= this._filteredItems.length) {
      this._selectedIndex = Math.max(0, this._filteredItems.length - 1);
    }
  }

  /**
   * Render the filtered list
   */
  private render(): void {
    this.config.render(this._filteredItems, this._selectedIndex, this.config.listContainer);
  }

  /**
   * Reset search state
   */
  reset(): void {
    this._query = '';
    this._selectedIndex = 0;
    this.config.searchInput.value = '';
    this.refresh();
  }

  /**
   * Get filtered items
   */
  get filteredItems(): T[] {
    return [...this._filteredItems];
  }

  /**
   * Get selected index
   */
  get selectedIndex(): number {
    return this._selectedIndex;
  }

  /**
   * Set selected index
   */
  set selectedIndex(index: number) {
    if (index >= 0 && index < this._filteredItems.length) {
      this._selectedIndex = index;
      this.render();
      this.config.onSelectionChange?.(this._selectedIndex);
    }
  }

  /**
   * Get current query
   */
  get query(): string {
    return this._query;
  }
}
