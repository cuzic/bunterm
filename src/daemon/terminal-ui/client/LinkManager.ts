/**
 * Link Manager
 *
 * Manages clickable URL links in terminal using xterm.js WebLinksAddon.
 * URLs are opened in new browser tabs when clicked.
 */

import type { Terminal, WebLinksAddon } from './types.js';

const WEB_LINKS_ADDON_CDN =
  'https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js';

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

    this.loadAddon()
      .then(() => {
        this.initialized = true;
      })
      .catch((_err) => {
        // Silently fail - links just won't be clickable
      });
  }

  /**
   * Load WebLinksAddon (from window or CDN)
   */
  private loadAddon(): Promise<WebLinksAddon> {
    if (this.webLinksAddon) {
      return Promise.resolve(this.webLinksAddon);
    }

    // Check if already available in window
    if (window.WebLinksAddon) {
      return this.initializeAddon();
    }

    // Load from CDN
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = WEB_LINKS_ADDON_CDN;

      script.onload = () => {
        if (window.WebLinksAddon) {
          this.initializeAddon().then(resolve).catch(reject);
        } else {
          reject(new Error('WebLinksAddon not found after script load'));
        }
      };

      script.onerror = () => {
        reject(new Error('Failed to load WebLinksAddon'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Initialize the addon with the terminal
   */
  private initializeAddon(): Promise<WebLinksAddon> {
    return new Promise((resolve, reject) => {
      const term = this.findTerminal();
      if (!term || !window.WebLinksAddon) {
        reject(new Error('Terminal or WebLinksAddon not available'));
        return;
      }

      // Create addon with handler that opens links in new tab
      this.webLinksAddon = new window.WebLinksAddon.WebLinksAddon(
        (_event: MouseEvent, uri: string) => {
          window.open(uri, '_blank', 'noopener,noreferrer');
        }
      );

      term.loadAddon(this.webLinksAddon);
      resolve(this.webLinksAddon);
    });
  }

  /**
   * Check if the addon is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
