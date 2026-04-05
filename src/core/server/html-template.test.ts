/**
 * Tests for native terminal HTML template generation
 */

import { describe, expect, test } from 'bun:test';
import type { Config } from '@/core/config/types.js';
import { generateNativeTerminalHtml } from './html-template.js';

const createTestConfig = (): Config => ({
  base_path: '/bunterm',
  daemon_port: 7680,
  listen_addresses: ['127.0.0.1'],
  sessions: [],
  caddy_admin_api: 'http://localhost:2019',
  terminal_ui: {
    font_size_default_mobile: 32,
    font_size_default_pc: 14,
    font_size_min: 10,
    font_size_max: 48,
    double_tap_delay: 300
  },
  notifications: {
    enabled: false,
    bell_notification: false,
    bell_cooldown: 10,
    patterns: [],
    default_cooldown: 300
  },
  file_transfer: {
    enabled: false,
    max_file_size: 100 * 1024 * 1024,
    allowed_extensions: []
  },
  preview: {
    enabled: false,
    default_width: 400,
    debounce_ms: 300,
    auto_refresh: true,
    allowed_extensions: ['.html', '.htm']
  },
  directory_browser: {
    enabled: false,
    allowed_directories: []
  },
  native_terminal: {
    scrollback: 10000,
    output_buffer_size: 1000
  }
});

describe('generateNativeTerminalHtml', () => {
  test('generates valid HTML document', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('</html>');
  });

  test('includes session name in title', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'my-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/my-session',
      config: createTestConfig()
    });

    expect(html).toContain('<title>my-session - bunterm</title>');
  });

  test('allows custom title override', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      title: 'Custom Terminal Title'
    });

    expect(html).toContain('<title>Custom Terminal Title</title>');
  });

  test('includes required script files', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<script src="/bunterm/xterm-bundle.js"></script>');
    expect(html).toContain('<script src="/bunterm/terminal-client.js"></script>');
    expect(html).toContain('<script src="/bunterm/terminal-ui.js"></script>');
  });

  test('includes xterm CSS stylesheet', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<link rel="stylesheet" href="/bunterm/xterm.css">');
  });

  test('includes WebSocket path in config', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('/bunterm/test-session/ws');
  });

  test('includes terminal container', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<div id="terminal"></div>');
  });

  test('includes loading indicator', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<div id="loading">Connecting...</div>');
  });

  test('includes PWA meta tags', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
    expect(html).toContain('<link rel="manifest" href="/bunterm/manifest.json">');
  });

  test('includes viewport meta for mobile', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('viewport');
    expect(html).toContain('user-scalable=no');
  });

  test('sets isNativeTerminal flag in config', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('"isNativeTerminal":true');
  });

  test('handles shared mode', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      isShared: true
    });

    expect(html).toContain('"isShared":true');
  });

  test('escapes HTML special characters in title', () => {
    const html = generateNativeTerminalHtml({
      sessionName: '<script>alert("xss")</script>',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('includes scrollback configuration', () => {
    const config = createTestConfig();
    config.native_terminal.scrollback = 50000;

    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config
    });

    expect(html).toContain('scrollback: 50000');
  });

  test('includes terminal UI HTML', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    // Terminal UI should include toolbar element
    expect(html).toContain('id="tui"');
  });

  test('stores config globally for terminal-ui.js', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('window.__BUNTERM_CONFIG__');
    expect(html).toContain('window.__TERMINAL_CLIENT__');
  });

  test('includes visibility change handler for reconnection', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).toContain('visibilitychange');
    expect(html).toContain("document.visibilityState === 'visible'");
  });

  test('includes base_path in terminal UI config (snake_case, not camelCase)', () => {
    // Regression test: terminal-ui.js expects base_path (snake_case), not basePath (camelCase)
    // If basePath is used instead, config.base_path will be undefined and cause:
    // "Cannot read properties of undefined (reading 'replace')" error
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    // Must have "base_path": not "basePath":
    expect(html).toContain('"base_path":"/bunterm"');
    // basePath should NOT appear as a JSON key (it can appear in JS variable names)
    expect(html).not.toMatch(/"basePath"\s*:/);
  });

  test('uses basePath parameter value for base_path config', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/custom-base',
      sessionPath: '/custom-base/test-session',
      config: createTestConfig()
    });

    // The base_path in config should match the basePath parameter
    expect(html).toContain('"base_path":"/custom-base"');
  });
});

describe('generateNativeTerminalHtml with nonce', () => {
  test('inline script tags have nonce attribute when nonce is provided', () => {
    const nonce = 'testNonce12345==';
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      nonce
    });

    // All inline <script> tags must have nonce attribute
    const inlineScripts = html.match(/<script(?:[^>]*)>[\s\S]*?<\/script>/g) ?? [];
    const inlineOnly = inlineScripts.filter((s) => !s.includes('src='));
    expect(inlineOnly.length).toBeGreaterThan(0);
    for (const script of inlineOnly) {
      expect(script).toContain(`nonce="${nonce}"`);
    }
  });

  test('external script src tags have nonce attribute when nonce is provided', () => {
    const nonce = 'testNonce12345==';
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      nonce
    });

    // External <script src="..."> tags must also have nonce attribute
    const externalScripts = html.match(/<script[^>]+src="[^"]*"[^>]*>/g) ?? [];
    expect(externalScripts.length).toBeGreaterThan(0);
    for (const script of externalScripts) {
      expect(script).toContain(`nonce="${nonce}"`);
    }
  });

  test('no nonce attribute on script tags when nonce is not provided', () => {
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig()
    });

    expect(html).not.toContain('nonce=');
  });

  test('nonce value is properly set on config inline script', () => {
    const nonce = 'configNonce==';
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      nonce
    });

    // The config script containing __TERMINAL_UI_CONFIG__ must have nonce
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('window.__TERMINAL_UI_CONFIG__');
  });

  test('nonce value is properly set on initialization inline script', () => {
    const nonce = 'initNonce==';
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      nonce
    });

    // The initialization script containing TerminalClient must have nonce
    const initScriptMatch = html.match(
      /<script[^>]*nonce="[^"]*"[^>]*>[\s\S]*?TerminalClient[\s\S]*?<\/script>/
    );
    expect(initScriptMatch).not.toBeNull();
    expect(initScriptMatch![0]).toContain(`nonce="${nonce}"`);
  });

  test('nonce is HTML-safe and does not break attribute parsing for base64', () => {
    // Base64 nonces can contain +, /, = characters — these are safe in double-quoted attributes
    const nonce = 'aB3+c/d==';
    const html = generateNativeTerminalHtml({
      sessionName: 'test-session',
      basePath: '/bunterm',
      sessionPath: '/bunterm/test-session',
      config: createTestConfig(),
      nonce
    });

    expect(html).toContain(`nonce="${nonce}"`);
  });
});
