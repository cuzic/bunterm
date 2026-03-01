/**
 * Search Manager
 *
 * Manages terminal search functionality using xterm.js SearchAddon.
 */

import type { SearchAddon, Terminal } from './types.js';

const SEARCH_ADDON_CDN =
  'https://cdn.jsdelivr.net/npm/@xterm/addon-search@0.15.0/lib/addon-search.min.js';

export class SearchManager {
  private searchAddon: SearchAddon | null = null;
  private caseSensitive = false;
  private regex = false;
  private currentMatchIndex = 0;
  private totalMatches = 0;

  private searchBar: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchCount: HTMLElement | null = null;
  private searchCaseBtn: HTMLElement | null = null;
  private searchRegexBtn: HTMLElement | null = null;

  private findTerminal: () => Terminal | null;

  constructor(findTerminal: () => Terminal | null) {
    this.findTerminal = findTerminal;
  }

  /**
   * Bind DOM elements
   */
  bindElements(
    searchBar: HTMLElement,
    searchInput: HTMLInputElement,
    searchCount: HTMLElement,
    searchCaseBtn: HTMLElement,
    searchRegexBtn: HTMLElement
  ): void {
    this.searchBar = searchBar;
    this.searchInput = searchInput;
    this.searchCount = searchCount;
    this.searchCaseBtn = searchCaseBtn;
    this.searchRegexBtn = searchRegexBtn;
  }

  /**
   * Load SearchAddon (from window or CDN)
   */
  loadAddon(): Promise<SearchAddon> {
    if (this.searchAddon) {
      return Promise.resolve(this.searchAddon);
    }

    // Check if already available
    if (window.SearchAddon) {
      const term = this.findTerminal();
      if (term) {
        this.searchAddon = new window.SearchAddon.SearchAddon();
        term.loadAddon(this.searchAddon);
        return Promise.resolve(this.searchAddon);
      }
    }

    // Load from CDN
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SEARCH_ADDON_CDN;

      script.onload = () => {
        const term = this.findTerminal();
        if (term && window.SearchAddon) {
          this.searchAddon = new window.SearchAddon.SearchAddon();
          term.loadAddon(this.searchAddon);
          resolve(this.searchAddon);
        } else {
          reject(new Error('Failed to initialize SearchAddon'));
        }
      };

      script.onerror = () => {
        reject(new Error('Failed to load SearchAddon'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Toggle search bar visibility
   */
  toggle(show?: boolean): void {
    if (!this.searchBar) {
      return;
    }

    if (typeof show === 'boolean') {
      this.searchBar.classList.toggle('hidden', !show);
    } else {
      this.searchBar.classList.toggle('hidden');
    }

    if (this.searchBar.classList.contains('hidden')) {
      // Clear search highlights when closing
      if (this.searchAddon?.clearDecorations) {
        this.searchAddon.clearDecorations();
      }
      this.updateMatchCount(0, 0);

      // Return focus to terminal
      const terminal = document.querySelector('.xterm-helper-textarea') as HTMLElement;
      terminal?.focus();
    } else {
      this.loadAddon()
        .then(() => {
          this.searchInput?.focus();
          this.searchInput?.select();
        })
        .catch((_err) => {});
    }
  }

  /**
   * Update match count display
   */
  private updateMatchCount(current: number, total: number): void {
    this.currentMatchIndex = current;
    this.totalMatches = total;
    if (this.searchCount) {
      this.searchCount.textContent = total === 0 ? '0/0' : `${current}/${total}`;
    }
  }

  /**
   * Count matches in terminal buffer
   */
  private countMatches(searchTerm: string): void {
    if (!this.searchAddon || !searchTerm) {
      this.updateMatchCount(0, 0);
      return;
    }

    const term = this.findTerminal();
    if (!term?.buffer?.active) {
      this.updateMatchCount(0, 0);
      return;
    }

    const buffer = term.buffer.active;
    const flags = this.caseSensitive ? 'g' : 'gi';
    let count = 0;

    let pattern: RegExp;
    try {
      pattern = this.regex
        ? new RegExp(searchTerm, flags)
        : new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch {
      this.updateMatchCount(0, 0);
      return;
    }

    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        const text = line.translateToString(true);
        const matches = text.match(pattern);
        if (matches) {
          count += matches.length;
        }
      }
    }

    this.updateMatchCount(this.currentMatchIndex, count);
  }

  /**
   * Find next match
   */
  findNext(): boolean {
    if (!this.searchAddon || !this.searchInput?.value) {
      return false;
    }

    const options = {
      caseSensitive: this.caseSensitive,
      regex: this.regex,
      incremental: false
    };

    const found = this.searchAddon.findNext(this.searchInput.value, options);
    if (found) {
      this.currentMatchIndex = Math.min(this.currentMatchIndex + 1, this.totalMatches);
      if (this.currentMatchIndex > this.totalMatches) {
        this.currentMatchIndex = 1;
      }
      this.updateMatchCount(this.currentMatchIndex, this.totalMatches);
    }
    return found;
  }

  /**
   * Find previous match
   */
  findPrevious(): boolean {
    if (!this.searchAddon || !this.searchInput?.value) {
      return false;
    }

    const options = {
      caseSensitive: this.caseSensitive,
      regex: this.regex
    };

    const found = this.searchAddon.findPrevious(this.searchInput.value, options);
    if (found) {
      this.currentMatchIndex = Math.max(this.currentMatchIndex - 1, 1);
      if (this.currentMatchIndex < 1) {
        this.currentMatchIndex = this.totalMatches;
      }
      this.updateMatchCount(this.currentMatchIndex, this.totalMatches);
    }
    return found;
  }

  /**
   * Perform search with current settings
   */
  doSearch(): void {
    const searchTerm = this.searchInput?.value;
    if (!searchTerm) {
      this.updateMatchCount(0, 0);
      return;
    }

    this.loadAddon().then(() => {
      this.countMatches(searchTerm);
      this.currentMatchIndex = 0;
      this.findNext();
    });
  }

  /**
   * Toggle case sensitivity
   */
  toggleCaseSensitive(): boolean {
    this.caseSensitive = !this.caseSensitive;
    this.searchCaseBtn?.classList.toggle('active', this.caseSensitive);
    this.doSearch();
    return this.caseSensitive;
  }

  /**
   * Toggle regex mode
   */
  toggleRegex(): boolean {
    this.regex = !this.regex;
    this.searchRegexBtn?.classList.toggle('active', this.regex);
    this.doSearch();
    return this.regex;
  }

  /**
   * Check if search bar is visible
   */
  isVisible(): boolean {
    return this.searchBar ? !this.searchBar.classList.contains('hidden') : false;
  }
}
