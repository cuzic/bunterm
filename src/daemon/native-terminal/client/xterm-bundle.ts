/**
 * xterm.js Bundle Entry Point
 *
 * This file bundles xterm.js and its addons for use in the browser.
 * It exports the Terminal class and addon instances for use by terminal-client.js.
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';

export {
  Terminal,
  FitAddon,
  WebLinksAddon,
  Unicode11Addon,
  SerializeAddon,
};

/**
 * Create a fully configured Terminal instance with all addons
 */
export function createTerminal(options?: {
  fontSize?: number;
  fontFamily?: string;
  cursorBlink?: boolean;
  scrollback?: number;
}): {
  terminal: Terminal;
  fitAddon: FitAddon;
  webLinksAddon: WebLinksAddon;
  unicode11Addon: Unicode11Addon;
  serializeAddon: SerializeAddon;
} {
  const terminal = new Terminal({
    fontSize: options?.fontSize ?? 14,
    fontFamily: options?.fontFamily ?? 'Menlo, Monaco, "Courier New", monospace',
    cursorBlink: options?.cursorBlink ?? true,
    scrollback: options?.scrollback ?? 10000,
    allowProposedApi: true,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(255, 255, 255, 0.3)',
    },
  });

  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  const unicode11Addon = new Unicode11Addon();
  const serializeAddon = new SerializeAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.loadAddon(unicode11Addon);
  terminal.loadAddon(serializeAddon);

  // Enable Unicode 11 support
  terminal.unicode.activeVersion = '11';

  return {
    terminal,
    fitAddon,
    webLinksAddon,
    unicode11Addon,
    serializeAddon,
  };
}
