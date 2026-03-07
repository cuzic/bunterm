/**
 * Link Manager
 *
 * Manages clickable URL links in terminal using xterm.js WebLinksAddon.
 * URLs are opened in new browser tabs when clicked.
 *
 * Note: WebLinksAddon is bundled from npm, no CDN dependency.
 */

import { WebLinksAddon as WebLinksAddonClass } from '@xterm/addon-web-links';
import type { Terminal, WebLinksAddon } from './types.js';

export class LinkManager {
  private webLinksAddon: WebLinksAddon | null = null;
  private initialized = false;

  private findTerminal: () => Terminal | null;

  constructor(findTerminal: () => Terminal | null) {
    this.findTerminal = findTerminal;
  }

  /**
   * Initialize the WebLinksAddon
   * Should be called after terminal is ready
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      this.initializeAddon();
      this.initialized = true;
    } catch (_err) {
      // Silently fail - links just won't be clickable
    }
  }

  /**
   * Initialize the addon with the terminal
   */
  private initializeAddon(): void {
    const term = this.findTerminal();
    if (!term) {
      throw new Error('Terminal not available');
    }

    // Create addon with handler that opens links in new tab
    this.webLinksAddon = new WebLinksAddonClass((_event: MouseEvent, uri: string) => {
      window.open(uri, '_blank', 'noopener,noreferrer');
    });

    term.loadAddon(this.webLinksAddon);
  }

  /**
   * Check if the addon is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
