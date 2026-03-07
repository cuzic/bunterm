/**
 * xterm.js Bundle Entry Point
 *
 * This file bundles xterm.js and its addons for use in the browser.
 * It exports the Terminal class and addon instances for use by terminal-client.js.
 */

import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { IDisposable } from '@xterm/xterm';

export {
  Terminal,
  FitAddon,
  WebLinksAddon,
  Unicode11Addon,
  SerializeAddon,
  SearchAddon,
  ClipboardAddon
};

/**
 * Check if data contains mouse escape sequences.
 * Mouse sequences that shells don't understand cause garbage output.
 *
 * Patterns:
 * - X10 mode: \x1b[M followed by 3 bytes (Cb Cx Cy)
 * - SGR mode: \x1b[< followed by parameters and M or m
 * - URXVT mode: \x1b[ followed by parameters and M
 */
export function containsMouseSequence(data: string): boolean {
  // X10 mouse mode: ESC [ M Cb Cx Cy (6 bytes total)
  if (data.includes('\x1b[M')) {
    return true;
  }

  // SGR extended mouse mode: ESC [ < Cb ; Cx ; Cy M (or m for release)
  // Example: \x1b[<0;27;10M
  if (/\x1b\[<[\d;]+[Mm]/.test(data)) {
    return true;
  }

  // URXVT mode: ESC [ Cb ; Cx ; Cy M
  // Similar to SGR but without the '<'
  if (/\x1b\[\d+;\d+;\d+M/.test(data)) {
    return true;
  }

  return false;
}

/**
 * Filter out mouse escape sequences from input data.
 * Returns the data with mouse sequences removed, or empty string if only mouse data.
 */
export function filterMouseSequences(data: string): string {
  // X10 mouse mode: ESC [ M Cb Cx Cy (always 6 bytes)
  // Remove all occurrences
  let filtered = data.replace(/\x1b\[M.../g, '');

  // SGR extended mouse mode: ESC [ < params M/m
  filtered = filtered.replace(/\x1b\[<[\d;]+[Mm]/g, '');

  // URXVT mode: ESC [ params M
  filtered = filtered.replace(/\x1b\[\d+;\d+;\d+M/g, '');

  return filtered;
}

/**
 * Create a fully configured Terminal instance with all addons
 */
export function createTerminal(options?: {
  fontSize?: number;
  fontFamily?: string;
  cursorBlink?: boolean;
  scrollback?: number;
  /** Disable mouse reporting to PTY (prevents garbage when shell doesn't handle mouse) */
  disableMouseReporting?: boolean;
}): {
  terminal: Terminal;
  fitAddon: FitAddon;
  webLinksAddon: WebLinksAddon;
  unicode11Addon: Unicode11Addon;
  serializeAddon: SerializeAddon;
  searchAddon: SearchAddon;
  clipboardAddon: ClipboardAddon;
} {
  const terminal = new Terminal({
    fontSize: options?.fontSize ?? 14,
    fontFamily: options?.fontFamily ?? 'Menlo, Monaco, "Courier New", monospace',
    cursorBlink: options?.cursorBlink ?? true,
    scrollback: options?.scrollback ?? 10000,
    allowProposedApi: true,
    // Scroll settings
    scrollOnUserInput: true, // Auto-scroll to bottom on user input
    scrollSensitivity: 1, // Normal scroll speed multiplier
    fastScrollModifier: 'alt', // Hold Alt for fast scroll
    fastScrollSensitivity: 5, // Fast scroll multiplier
    smoothScrollDuration: 0, // Instant scroll (0 = no animation)
    // Selection settings
    // Double-click: select word (built-in)
    // Triple-click: select line (built-in)
    // Shift+click: extend selection (built-in)
    wordSeparator: ' ()[]{}\'"`,;:@#$%^&*=+|\\<>~', // Characters that separate words
    rightClickSelectsWord: false, // We use right-click for paste instead
    altClickMovesCursor: true, // Alt+click moves cursor (default)
    macOptionClickForcesSelection: true, // Option+click forces selection on Mac
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(255, 255, 255, 0.3)'
    }
  });

  const fitAddon = new FitAddon();
  // Open links in new tab when clicked (Ctrl+click or Cmd+click on macOS)
  const webLinksAddon = new WebLinksAddon((_event, uri) => {
    window.open(uri, '_blank', 'noopener,noreferrer');
  });
  const unicode11Addon = new Unicode11Addon();
  const serializeAddon = new SerializeAddon();
  const searchAddon = new SearchAddon();
  const clipboardAddon = new ClipboardAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.loadAddon(unicode11Addon);
  terminal.loadAddon(serializeAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(clipboardAddon);

  // Enable Unicode 11 support
  terminal.unicode.activeVersion = '11';

  return {
    terminal,
    fitAddon,
    webLinksAddon,
    unicode11Addon,
    serializeAddon,
    searchAddon,
    clipboardAddon
  };
}

/**
 * Setup auto-copy selection to clipboard on mouseup
 * Call this after terminal.open() since terminal.element is only available after opening
 */
export function setupSelectionAutoCopy(terminal: Terminal): void {
  if (!terminal.element) {
    console.warn(
      '[xterm-bundle] Cannot setup auto-copy: terminal.element is null (call after terminal.open())'
    );
    return;
  }

  terminal.element.addEventListener('mouseup', () => {
    const selection = terminal.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {
        // Clipboard write failed (likely due to permissions)
        // Silently ignore - user can still use Ctrl+Shift+C
      });
    }
  });
}

/**
 * Setup right-click to paste from clipboard
 * Call this after terminal.open() since terminal.element is only available after opening
 */
export function setupRightClickPaste(terminal: Terminal, sendInput: (data: string) => void): void {
  if (!terminal.element) {
    console.warn('[xterm-bundle] Cannot setup right-click paste: terminal.element is null');
    return;
  }

  terminal.element.addEventListener('contextmenu', async (e) => {
    e.preventDefault();

    // If there's a selection, don't paste (user might want to copy)
    if (terminal.hasSelection()) {
      // Clear selection and let user right-click again to paste
      terminal.clearSelection();
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sendInput(text);
      }
    } catch {
      // Clipboard read failed (permissions or empty)
      // Show a brief visual indicator
      console.log('[xterm-bundle] Clipboard read failed - check permissions');
    }
  });
}

/**
 * Setup selection highlight - highlight all occurrences of selected text
 * Uses SearchAddon for highlighting
 * Call this after terminal.open() since terminal.element is only available after opening
 */
export function setupSelectionHighlight(terminal: Terminal, searchAddon: SearchAddon): IDisposable {
  let highlightTimeout: number | null = null;
  let lastSelection = '';

  const clearHighlight = () => {
    if (highlightTimeout) {
      window.clearTimeout(highlightTimeout);
      highlightTimeout = null;
    }
    searchAddon.clearDecorations();
    lastSelection = '';
  };

  const highlightSelection = () => {
    const selection = terminal.getSelection();

    // Clear if no selection or same as before
    if (!selection || selection === lastSelection) {
      if (!selection) {
        clearHighlight();
      }
      return;
    }

    // Don't highlight whitespace-only or very short selections
    const trimmed = selection.trim();
    if (trimmed.length < 2) {
      clearHighlight();
      return;
    }

    // Don't highlight very long selections (performance)
    if (selection.length > 100) {
      clearHighlight();
      return;
    }

    lastSelection = selection;

    // Escape special regex characters for literal search
    const escaped = selection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Search with decorations (this highlights all matches)
    searchAddon.findNext(escaped, {
      regex: true,
      caseSensitive: true,
      decorations: {
        matchBackground: '#264f78', // Blue-ish background
        matchBorder: '#3794ff',
        matchOverviewRuler: '#3794ff',
        activeMatchBackground: '#515c6a', // Slightly different for active
        activeMatchBorder: '#74b0f3',
        activeMatchColorOverviewRuler: '#74b0f3'
      }
    });
  };

  // Debounced highlight on selection change
  const onSelectionChange = terminal.onSelectionChange(() => {
    if (highlightTimeout) {
      window.clearTimeout(highlightTimeout);
    }
    highlightTimeout = window.setTimeout(highlightSelection, 150);
  });

  // Clear highlights when terminal loses focus
  const onBlur = () => {
    clearHighlight();
  };

  terminal.element?.addEventListener('blur', onBlur);

  return {
    dispose: () => {
      onSelectionChange.dispose();
      terminal.element?.removeEventListener('blur', onBlur);
      clearHighlight();
    }
  };
}
