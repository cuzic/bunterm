/**
 * Search Manager
 *
 * Manages terminal search functionality using xterm.js SearchAddon.
 *
 * Note: SearchAddon is bundled from npm, no CDN dependency.
 */

import { SearchAddon as SearchAddonClass } from '@xterm/addon-search';
import type { SearchAddon, Terminal } from '@/browser/shared/types.js';

export class SearchManager {
  private searchAddon: SearchAddon | null = null;
  private caseSensitive = false;
  private regex = false;
  private currentMatchIndex = 0;

  private searchBar: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchCount: HTMLElement | null = null;
  private searchCaseBtn: HTMLElement | null = null;
  private searchRegexBtn: HTMLElement | null = null;

  private findTerminal: () => Terminal | null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 150;

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
   * Load SearchAddon (synchronous - bundled from npm)
   */
  loadAddon(): Promise<SearchAddon> {
    if (this.searchAddon) {
      return Promise.resolve(this.searchAddon);
    }

    const term = this.findTerminal();
    if (!term) {
      return Promise.reject(new Error('Terminal not available'));
    }

    // Create SearchAddon with decoration options for highlighting
    this.searchAddon = new SearchAddonClass({
      decorations: {
        matchBackground: '#665500', // Yellow-ish background for matches
        matchBorder: '#ffaa00', // Orange border
        matchOverviewRuler: '#ffaa00', // Orange in overview ruler
        activeMatchBackground: '#ff6600', // Orange background for active match
        activeMatchBorder: '#ff9900', // Brighter orange border
        activeMatchColorOverviewRuler: '#ff6600' // Orange in overview ruler
      },
      highlightLimit: 1000 // Max matches to highlight
    });
    term.loadAddon(this.searchAddon);

    // Listen to match change events to update count display
    this.searchAddon.onDidChangeResults?.((results) => {
      if (results) {
        this.updateMatchCount(results.resultIndex + 1, results.resultCount);
      } else {
        this.updateMatchCount(0, 0);
      }
    });

    return Promise.resolve(this.searchAddon);
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
      incremental: false,
      decorations: {
        matchBackground: '#665500',
        matchBorder: '#ffaa00',
        matchOverviewRuler: '#ffaa00',
        activeMatchBackground: '#ff6600',
        activeMatchBorder: '#ff9900',
        activeMatchColorOverviewRuler: '#ff6600'
      }
    };

    return this.searchAddon.findNext(this.searchInput.value, options);
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
      regex: this.regex,
      decorations: {
        matchBackground: '#665500',
        matchBorder: '#ffaa00',
        matchOverviewRuler: '#ffaa00',
        activeMatchBackground: '#ff6600',
        activeMatchBorder: '#ff9900',
        activeMatchColorOverviewRuler: '#ff6600'
      }
    };

    return this.searchAddon.findPrevious(this.searchInput.value, options);
  }

  /**
   * Perform search with current settings (debounced for input events)
   */
  doSearch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.doSearchImmediate();
    }, this.debounceMs);
  }

  /**
   * Perform search immediately (for toggle buttons)
   */
  private doSearchImmediate(): void {
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
    this.doSearchImmediate();
    return this.caseSensitive;
  }

  /**
   * Toggle regex mode
   */
  toggleRegex(): boolean {
    this.regex = !this.regex;
    this.searchRegexBtn?.classList.toggle('active', this.regex);
    this.doSearchImmediate();
    return this.regex;
  }

  /**
   * Check if search bar is visible
   */
  get isVisible(): boolean {
    return this.searchBar ? !this.searchBar.classList.contains('hidden') : false;
  }
}
