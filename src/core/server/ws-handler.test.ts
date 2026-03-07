/**
 * Tests for native terminal WebSocket handler utilities
 */

import { describe, expect, test } from 'bun:test';
import { isNativeTerminalHtmlPath, isNativeTerminalWebSocketPath } from './ws-handler.js';

describe('isNativeTerminalWebSocketPath', () => {
  const basePath = '/bunterm';

  test('returns true for valid WebSocket path', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm/my-session/ws', basePath)).toBe(true);
  });

  test('returns true for session with dashes', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm/my-long-session-name/ws', basePath)).toBe(true);
  });

  test('returns false for session path without /ws', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm/my-session', basePath)).toBe(false);
  });

  test('returns false for base path', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm', basePath)).toBe(false);
  });

  test('returns false for base path with trailing slash', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm/', basePath)).toBe(false);
  });

  test('returns false for different base path', () => {
    expect(isNativeTerminalWebSocketPath('/other/my-session/ws', basePath)).toBe(false);
  });

  test('returns false for API path', () => {
    expect(isNativeTerminalWebSocketPath('/bunterm/api/sessions', basePath)).toBe(false);
  });

  test('returns true for nested session name (edge case)', () => {
    // This might be a valid edge case - session name containing slash equivalent
    expect(isNativeTerminalWebSocketPath('/bunterm/session/ws', basePath)).toBe(true);
  });
});

describe('isNativeTerminalHtmlPath', () => {
  const basePath = '/bunterm';

  test('returns true for session path', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/my-session', basePath)).toBe(true);
  });

  test('returns true for session path with trailing slash', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/my-session/', basePath)).toBe(true);
  });

  test('returns false for WebSocket path', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/my-session/ws', basePath)).toBe(false);
  });

  test('returns false for static file path', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/terminal-ui.js', basePath)).toBe(false);
    expect(isNativeTerminalHtmlPath('/bunterm/xterm.css', basePath)).toBe(false);
    expect(isNativeTerminalHtmlPath('/bunterm/manifest.json', basePath)).toBe(false);
  });

  test('returns false for base path', () => {
    expect(isNativeTerminalHtmlPath('/bunterm', basePath)).toBe(false);
  });

  test('returns false for base path with trailing slash', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/', basePath)).toBe(false);
  });

  test('returns false for API path', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/api/sessions', basePath)).toBe(false);
  });

  test('returns false for different base path', () => {
    expect(isNativeTerminalHtmlPath('/other/my-session', basePath)).toBe(false);
  });

  test('returns true for session with dashes', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/my-long-session-name', basePath)).toBe(true);
  });

  test('returns true for session with underscores', () => {
    expect(isNativeTerminalHtmlPath('/bunterm/my_session_name', basePath)).toBe(true);
  });
});
