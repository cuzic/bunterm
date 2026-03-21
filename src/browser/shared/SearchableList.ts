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
  private filteredItems: T[] = [];
  private selectedIndex = 0;
  private query = '';

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
      this.query = searchInput.value.toLowerCase().trim();
      this.selectedIndex = 0;
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
      if (!Number.isNaN(index) && index >= 0 && index < this.filteredItems.length) {
        this.config.onSelect(this.filteredItems[index], index);
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
    if (this.filteredItems.length === 0) {
      return;
    }

    const wrap = this.config.wrapNavigation ?? false;
    const newIndex = this.selectedIndex + 1;

    if (newIndex >= this.filteredItems.length) {
      this.selectedIndex = wrap ? 0 : this.filteredItems.length - 1;
    } else {
      this.selectedIndex = newIndex;
    }

    this.render();
    this.config.onSelectionChange?.(this.selectedIndex);
    this.scrollToSelected();
  }

  /**
   * Select previous item
   */
  private selectPrevious(): void {
    if (this.filteredItems.length === 0) {
      return;
    }

    const wrap = this.config.wrapNavigation ?? false;
    const newIndex = this.selectedIndex - 1;

    if (newIndex < 0) {
      this.selectedIndex = wrap ? this.filteredItems.length - 1 : 0;
    } else {
      this.selectedIndex = newIndex;
    }

    this.render();
    this.config.onSelectionChange?.(this.selectedIndex);
    this.scrollToSelected();
  }

  /**
   * Select current item
   */
  private selectCurrent(): void {
    if (this.filteredItems.length > 0 && this.selectedIndex < this.filteredItems.length) {
      this.config.onSelect(this.filteredItems[this.selectedIndex], this.selectedIndex);
    }
  }

  /**
   * Scroll to keep selected item visible
   */
  private scrollToSelected(): void {
    const itemSelector = this.config.itemSelector ?? '[data-index]';
    const selectedEl = this.config.listContainer.querySelector(
      `${itemSelector}[data-index="${this.selectedIndex}"]`
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
    if (this.query) {
      this.filteredItems = allItems.filter((item) => this.config.filter(item, this.query));
    } else {
      this.filteredItems = [...allItems];
    }

    // Clamp selected index
    if (this.selectedIndex >= this.filteredItems.length) {
      this.selectedIndex = Math.max(0, this.filteredItems.length - 1);
    }
  }

  /**
   * Render the filtered list
   */
  private render(): void {
    this.config.render(this.filteredItems, this.selectedIndex, this.config.listContainer);
  }

  /**
   * Reset search state
   */
  reset(): void {
    this.query = '';
    this.selectedIndex = 0;
    this.config.searchInput.value = '';
    this.refresh();
  }

  /**
   * Get filtered items
   */
  getFilteredItems(): T[] {
    return [...this.filteredItems];
  }

  /**
   * Get selected index
   */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /**
   * Set selected index
   */
  setSelectedIndex(index: number): void {
    if (index >= 0 && index < this.filteredItems.length) {
      this.selectedIndex = index;
      this.render();
      this.config.onSelectionChange?.(this.selectedIndex);
    }
  }

  /**
   * Get current query
   */
  getQuery(): string {
    return this.query;
  }
}
