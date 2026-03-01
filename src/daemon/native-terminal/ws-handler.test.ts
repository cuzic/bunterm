/**
 * Tests for native terminal WebSocket handler utilities
 */

import { describe, expect, test } from 'bun:test';
import { isNativeTerminalWebSocketPath, isNativeTerminalHtmlPath } from './ws-handler.js';

describe('isNativeTerminalWebSocketPath', () => {
  const basePath = '/ttyd-mux';

  test('returns true for valid WebSocket path', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/my-session/ws', basePath)).toBe(true);
  });

  test('returns true for session with dashes', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/my-long-session-name/ws', basePath)).toBe(true);
  });

  test('returns false for session path without /ws', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/my-session', basePath)).toBe(false);
  });

  test('returns false for base path', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux', basePath)).toBe(false);
  });

  test('returns false for base path with trailing slash', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/', basePath)).toBe(false);
  });

  test('returns false for different base path', () => {
    expect(isNativeTerminalWebSocketPath('/other/my-session/ws', basePath)).toBe(false);
  });

  test('returns false for API path', () => {
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/api/sessions', basePath)).toBe(false);
  });

  test('returns true for nested session name (edge case)', () => {
    // This might be a valid edge case - session name containing slash equivalent
    expect(isNativeTerminalWebSocketPath('/ttyd-mux/session/ws', basePath)).toBe(true);
  });
});

describe('isNativeTerminalHtmlPath', () => {
  const basePath = '/ttyd-mux';

  test('returns true for session path', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/my-session', basePath)).toBe(true);
  });

  test('returns true for session path with trailing slash', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/my-session/', basePath)).toBe(true);
  });

  test('returns false for WebSocket path', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/my-session/ws', basePath)).toBe(false);
  });

  test('returns false for static file path', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/terminal-ui.js', basePath)).toBe(false);
    expect(isNativeTerminalHtmlPath('/ttyd-mux/xterm.css', basePath)).toBe(false);
    expect(isNativeTerminalHtmlPath('/ttyd-mux/manifest.json', basePath)).toBe(false);
  });

  test('returns false for base path', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux', basePath)).toBe(false);
  });

  test('returns false for base path with trailing slash', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/', basePath)).toBe(false);
  });

  test('returns false for API path', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/api/sessions', basePath)).toBe(false);
  });

  test('returns false for different base path', () => {
    expect(isNativeTerminalHtmlPath('/other/my-session', basePath)).toBe(false);
  });

  test('returns true for session with dashes', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/my-long-session-name', basePath)).toBe(true);
  });

  test('returns true for session with underscores', () => {
    expect(isNativeTerminalHtmlPath('/ttyd-mux/my_session_name', basePath)).toBe(true);
  });
});
