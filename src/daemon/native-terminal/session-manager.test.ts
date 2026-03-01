/**
 * Tests for NativeSessionManager
 *
 * Note: Some tests require actual PTY support (POSIX only).
 * Tests that require real processes are marked and may be skipped in CI.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Config } from '@/config/types.js';
import { NativeSessionManager } from './session-manager.js';

// Test config
const createTestConfig = (): Config => ({
  base_path: '/ttyd-mux',
  base_port: 7600,
  daemon_port: 7680,
  listen_addresses: ['127.0.0.1'],
  listen_sockets: [],
  auto_attach: true,
  sessions: [],
  proxy_mode: 'proxy',
  session_backend: 'native',
  caddy_admin_api: 'http://localhost:2019',
  tmux_mode: 'auto',
  terminal_ui: {
    font_size_default_mobile: 32,
    font_size_default_pc: 14,
    font_size_min: 10,
    font_size_max: 48,
    double_tap_delay: 300,
  },
  notifications: {
    enabled: false,
    bell_notification: false,
    bell_cooldown: 10,
    patterns: [],
    default_cooldown: 300,
  },
  file_transfer: {
    enabled: false,
    max_file_size: 100 * 1024 * 1024,
    allowed_extensions: [],
  },
  tabs: {
    enabled: false,
    orientation: 'vertical',
    position: 'left',
    tab_width: 200,
    tab_height: 40,
    auto_refresh_interval: 5000,
    preload_iframes: false,
    show_session_info: true,
  },
  preview: {
    enabled: false,
    default_width: 400,
    debounce_ms: 300,
    auto_refresh: true,
    allowed_extensions: ['.html', '.htm'],
  },
  directory_browser: {
    enabled: false,
    allowed_directories: [],
  },
  native_terminal: {
    scrollback: 10000,
    output_buffer_size: 1000,
  },
});

describe('NativeSessionManager', () => {
  let manager: NativeSessionManager;

  beforeEach(() => {
    manager = new NativeSessionManager(createTestConfig());
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  describe('session existence checks', () => {
    test('hasSession returns false for non-existent session', () => {
      expect(manager.hasSession('nonexistent')).toBe(false);
    });

    test('getSession returns undefined for non-existent session', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined();
    });

    test('getSessionNames returns empty array initially', () => {
      expect(manager.getSessionNames()).toEqual([]);
    });

    test('sessionCount returns 0 initially', () => {
      expect(manager.sessionCount).toBe(0);
    });

    test('listSessions returns empty array initially', () => {
      expect(manager.listSessions()).toEqual([]);
    });
  });

  describe('session path resolution', () => {
    test('getSessionByPath returns undefined when no sessions exist', () => {
      expect(manager.getSessionByPath('/ttyd-mux/my-session')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    test('stopSession throws for non-existent session', async () => {
      await expect(manager.stopSession('nonexistent')).rejects.toThrow('Session nonexistent not found');
    });

    test('getSessionInfo returns undefined for non-existent session', () => {
      expect(manager.getSessionInfo('nonexistent')).toBeUndefined();
    });
  });

  describe('stopAll', () => {
    test('stopAll succeeds when no sessions exist', async () => {
      await expect(manager.stopAll()).resolves.toBeUndefined();
    });
  });
});

// Integration tests that require real PTY support
// These tests are only run if Bun.Terminal is available (POSIX systems)
const hasPtySupport = process.platform !== 'win32';

describe.skipIf(!hasPtySupport)('NativeSessionManager with real PTY', () => {
  let manager: NativeSessionManager;
  const testDir = process.cwd();

  beforeEach(() => {
    const config = createTestConfig();
    // Use 'new' mode to avoid tmux session conflicts
    config.tmux_mode = 'new';
    manager = new NativeSessionManager(config);
  });

  afterEach(async () => {
    await manager.stopAll();
    // Give time for processes to clean up
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test('createSession creates a new session', async () => {
    const session = await manager.createSession({
      name: 'test-pty-session',
      dir: testDir,
      path: '/ttyd-mux/test-pty-session',
    });

    expect(session).toBeDefined();
    expect(session.name).toBe('test-pty-session');
    expect(manager.hasSession('test-pty-session')).toBe(true);
    expect(manager.sessionCount).toBe(1);
  });

  test('createSession throws for duplicate session name', async () => {
    await manager.createSession({
      name: 'duplicate-session',
      dir: testDir,
      path: '/ttyd-mux/duplicate-session',
    });

    await expect(
      manager.createSession({
        name: 'duplicate-session',
        dir: testDir,
        path: '/ttyd-mux/duplicate-session',
      })
    ).rejects.toThrow('Session duplicate-session already exists');
  });

  test('getSession returns session after creation', async () => {
    await manager.createSession({
      name: 'get-session-test',
      dir: testDir,
      path: '/ttyd-mux/get-session-test',
    });

    const session = manager.getSession('get-session-test');
    expect(session).toBeDefined();
    expect(session?.name).toBe('get-session-test');
  });

  test('getSessionByPath returns session for matching path', async () => {
    await manager.createSession({
      name: 'path-test-session',
      dir: testDir,
      path: '/ttyd-mux/path-test-session',
    });

    const session = manager.getSessionByPath('/ttyd-mux/path-test-session');
    expect(session).toBeDefined();
    expect(session?.name).toBe('path-test-session');
  });

  test('getSessionByPath handles WebSocket path', async () => {
    await manager.createSession({
      name: 'ws-path-session',
      dir: testDir,
      path: '/ttyd-mux/ws-path-session',
    });

    const session = manager.getSessionByPath('/ttyd-mux/ws-path-session/ws');
    expect(session).toBeDefined();
    expect(session?.name).toBe('ws-path-session');
  });

  test('stopSession stops and removes session', async () => {
    await manager.createSession({
      name: 'stop-test-session',
      dir: testDir,
      path: '/ttyd-mux/stop-test-session',
    });

    expect(manager.hasSession('stop-test-session')).toBe(true);

    await manager.stopSession('stop-test-session');

    expect(manager.hasSession('stop-test-session')).toBe(false);
  });

  test('listSessions returns session info', async () => {
    await manager.createSession({
      name: 'list-test-session',
      dir: testDir,
      path: '/ttyd-mux/list-test-session',
    });

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('list-test-session');
    expect(sessions[0].dir).toBe(testDir);
    expect(sessions[0].path).toBe('/ttyd-mux/list-test-session');
  });

  test('getSessionInfo returns session details', async () => {
    await manager.createSession({
      name: 'info-test-session',
      dir: testDir,
      path: '/ttyd-mux/info-test-session',
      cols: 120,
      rows: 40,
    });

    const info = manager.getSessionInfo('info-test-session');
    expect(info).toBeDefined();
    expect(info?.name).toBe('info-test-session');
    expect(info?.cwd).toBe(testDir);
    expect(info?.cols).toBe(120);
    expect(info?.rows).toBe(40);
  });

  test('multiple sessions can be created', async () => {
    await manager.createSession({
      name: 'multi-session-1',
      dir: testDir,
      path: '/ttyd-mux/multi-session-1',
    });

    await manager.createSession({
      name: 'multi-session-2',
      dir: testDir,
      path: '/ttyd-mux/multi-session-2',
    });

    expect(manager.sessionCount).toBe(2);
    expect(manager.getSessionNames()).toContain('multi-session-1');
    expect(manager.getSessionNames()).toContain('multi-session-2');
  });

  test('stopAll stops all sessions', async () => {
    await manager.createSession({
      name: 'stopall-1',
      dir: testDir,
      path: '/ttyd-mux/stopall-1',
    });

    await manager.createSession({
      name: 'stopall-2',
      dir: testDir,
      path: '/ttyd-mux/stopall-2',
    });

    expect(manager.sessionCount).toBe(2);

    await manager.stopAll();

    expect(manager.sessionCount).toBe(0);
  });
});
