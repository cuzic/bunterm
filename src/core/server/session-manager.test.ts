/**
 * Tests for NativeSessionManager
 *
 * Note: Some tests require actual PTY support (POSIX only).
 * Tests that require real processes are marked and may be skipped in CI.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Config } from '@/core/config/types.js';
import { nullPlugins } from '@/core/terminal/session-plugins.js';
import { NativeSessionManager } from './session-manager.js';

// Test config
const createTestConfig = (): Config =>
  ({
    base_path: '/bunterm',
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1'],
    tmux_passthrough: false,
    sessions: [],
    caddy_admin_api: 'http://localhost:2019',
    daemon_manager: 'direct',
    terminal_ui: {
      font_size_default_mobile: 32,
      font_size_default_pc: 14,
      font_size_min: 10,
      font_size_max: 48,
      double_tap_delay: 300,
      reconnect_retries: 3,
      reconnect_interval: 2000
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
      allowed_extensions: ['.html', '.htm'],
      static_serving: {
        enabled: true,
        allowed_extensions: ['.html', '.htm', '.js', '.css', '.json', '.png', '.jpg', '.svg'],
        spa_fallback: true,
        max_file_size: 50 * 1024 * 1024
      }
    },
    directory_browser: {
      enabled: false,
      allowed_directories: []
    },
    sentry: {
      enabled: false,
      environment: 'production',
      sample_rate: 1.0,
      traces_sample_rate: 0.1,
      debug: false
    },
    native_terminal: {
      enabled: false,
      default_shell: '/bin/bash',
      scrollback: 10000,
      output_buffer_size: 1000
    },
    ai_chat: {
      enabled: false,
      default_runner: 'auto',
      cache_enabled: true,
      cache_ttl_ms: 3600000,
      rate_limit_enabled: true,
      rate_limit_max_requests: 20,
      rate_limit_window_ms: 60000
    },
    security: {
      dev_mode: false,
      allowed_origins: [],
      enable_ws_token_auth: false,
      ws_token_ttl_seconds: 30,
      auth_enabled: false,
      auth_cookie_name: 'bunterm_session',
      auth_session_ttl_seconds: 86400,
      auth_localhost_bypass: true,
      auth_stealth_mode: false,
      auth_trusted_proxies: [],
      auth_proxy_header: 'X-Forwarded-User',
      auth_adaptive_shield: false,
      auth_lan_session_ttl_seconds: 604800,
      auth_internet_session_ttl_seconds: 3600
    },
    static_offload: {
      enabled: false,
      internal_path_prefix: '/_internal_files'
    }
  }) as Config;

describe('NativeSessionManager', () => {
  let manager: NativeSessionManager;

  beforeEach(() => {
    manager = new NativeSessionManager(createTestConfig(), () => nullPlugins);
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
      expect(manager.getSessionByPath('/bunterm/my-session')).toBeUndefined();
    });
  });

  describe('error handling', () => {
    test('stopSession throws for non-existent session', async () => {
      await expect(manager.stopSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found'
      );
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
    manager = new NativeSessionManager(createTestConfig(), () => nullPlugins);
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
      path: '/bunterm/test-pty-session'
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
      path: '/bunterm/duplicate-session'
    });

    await expect(
      manager.createSession({
        name: 'duplicate-session',
        dir: testDir,
        path: '/bunterm/duplicate-session'
      })
    ).rejects.toThrow('Session duplicate-session already exists');
  });

  test('getSession returns session after creation', async () => {
    await manager.createSession({
      name: 'get-session-test',
      dir: testDir,
      path: '/bunterm/get-session-test'
    });

    const session = manager.getSession('get-session-test');
    expect(session).toBeDefined();
    expect(session?.name).toBe('get-session-test');
  });

  test('getSessionByPath returns session for matching path', async () => {
    await manager.createSession({
      name: 'path-test-session',
      dir: testDir,
      path: '/bunterm/path-test-session'
    });

    const session = manager.getSessionByPath('/bunterm/path-test-session');
    expect(session).toBeDefined();
    expect(session?.name).toBe('path-test-session');
  });

  test('getSessionByPath handles WebSocket path', async () => {
    await manager.createSession({
      name: 'ws-path-session',
      dir: testDir,
      path: '/bunterm/ws-path-session'
    });

    const session = manager.getSessionByPath('/bunterm/ws-path-session/ws');
    expect(session).toBeDefined();
    expect(session?.name).toBe('ws-path-session');
  });

  test('stopSession stops and removes session', async () => {
    await manager.createSession({
      name: 'stop-test-session',
      dir: testDir,
      path: '/bunterm/stop-test-session'
    });

    expect(manager.hasSession('stop-test-session')).toBe(true);

    await manager.stopSession('stop-test-session');

    expect(manager.hasSession('stop-test-session')).toBe(false);
  });

  test('listSessions returns session info', async () => {
    await manager.createSession({
      name: 'list-test-session',
      dir: testDir,
      path: '/bunterm/list-test-session'
    });

    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('list-test-session');
    expect(sessions[0].dir).toBe(testDir);
    expect(sessions[0].path).toBe('/bunterm/list-test-session');
  });

  test('getSessionInfo returns session details', async () => {
    await manager.createSession({
      name: 'info-test-session',
      dir: testDir,
      path: '/bunterm/info-test-session',
      cols: 120,
      rows: 40
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
      path: '/bunterm/multi-session-1'
    });

    await manager.createSession({
      name: 'multi-session-2',
      dir: testDir,
      path: '/bunterm/multi-session-2'
    });

    expect(manager.sessionCount).toBe(2);
    expect(manager.getSessionNames()).toContain('multi-session-1');
    expect(manager.getSessionNames()).toContain('multi-session-2');
  });

  test('stopAll stops all sessions', async () => {
    await manager.createSession({
      name: 'stopall-1',
      dir: testDir,
      path: '/bunterm/stopall-1'
    });

    await manager.createSession({
      name: 'stopall-2',
      dir: testDir,
      path: '/bunterm/stopall-2'
    });

    expect(manager.sessionCount).toBe(2);

    await manager.stopAll();

    expect(manager.sessionCount).toBe(0);
  });

  test('createSession with command template', async () => {
    const config = createTestConfig();
    config.command = 'echo hello {{name}}';
    const mgr = new NativeSessionManager(config, () => nullPlugins);

    try {
      const session = await mgr.createSession({
        name: 'template-test',
        dir: testDir,
        path: '/bunterm/template-test'
      });

      expect(session).toBeDefined();
      expect(session.name).toBe('template-test');
    } finally {
      await mgr.stopAll();
    }
  });

  test('createSession with per-session command override', async () => {
    const session = await manager.createSession({
      name: 'override-test',
      dir: testDir,
      path: '/bunterm/override-test',
      command: ['echo', 'hello']
    });

    expect(session).toBeDefined();
    expect(session.name).toBe('override-test');
  });
});
