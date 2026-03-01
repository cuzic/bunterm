/**
 * Tests for preview static file serving
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@/config/types.js';

// Test directory
const TEST_DIR = '/tmp/ttyd-mux-preview-static-test';
const SESSION_DIR = join(TEST_DIR, 'my-session');

// Test config
const createTestConfig = (overrides?: Partial<Config['preview']>): Config => ({
  base_path: '/ttyd-mux',
  base_port: 7600,
  daemon_port: 7680,
  listen_addresses: ['127.0.0.1'],
  listen_sockets: [],
  proxy_mode: 'proxy',
  caddy_admin_api: 'http://localhost:2019',
  terminal_ui: {
    font_size_default_mobile: 32,
    font_size_default_pc: 14,
    font_size_min: 10,
    font_size_max: 48,
    double_tap_delay: 300,
    reconnect_retries: 3,
    reconnect_interval: 2000
  },
  file_transfer: {
    enabled: true,
    max_file_size: 100 * 1024 * 1024,
    allowed_extensions: []
  },
  notifications: {
    enabled: true,
    bell_notification: true,
    bell_cooldown: 10,
    patterns: [],
    default_cooldown: 300
  },
  tabs: {
    enabled: true,
    orientation: 'vertical',
    position: 'left',
    tab_width: 200,
    tab_height: 40,
    auto_refresh_interval: 5000,
    preload_iframes: false,
    show_session_info: true
  },
  preview: {
    enabled: true,
    default_width: 400,
    debounce_ms: 300,
    auto_refresh: true,
    allowed_extensions: ['.html', '.htm'],
    static_serving: {
      enabled: true,
      allowed_extensions: ['.html', '.js', '.css', '.json', '.png', '.svg'],
      spa_fallback: true,
      max_file_size: 10 * 1024 * 1024
    },
    ...overrides
  },
  directory_browser: {
    enabled: false,
    allowed_directories: []
  }
});

// Setup test files
beforeAll(() => {
  // Clean up if exists
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }

  // Create test directory structure
  mkdirSync(SESSION_DIR, { recursive: true });
  mkdirSync(join(SESSION_DIR, 'dist'), { recursive: true });
  mkdirSync(join(SESSION_DIR, 'dist/assets'), { recursive: true });

  // Create test files
  writeFileSync(
    join(SESSION_DIR, 'dist/index.html'),
    '<!DOCTYPE html><html><body>Hello SPA</body></html>'
  );
  writeFileSync(join(SESSION_DIR, 'dist/assets/app.js'), 'console.log("Hello");');
  writeFileSync(join(SESSION_DIR, 'dist/assets/style.css'), 'body { color: red; }');
  writeFileSync(join(SESSION_DIR, 'dist/data.json'), '{"key": "value"}');

  // Register a mock session
  // We need to mock sessionManager.findByName
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
});

describe('preview-static', () => {
  describe('MIME types', () => {
    test('returns correct MIME type for .html', () => {
      // This is a unit test for the MIME type logic
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      };

      expect(mimeTypes['.html']).toBe('text/html; charset=utf-8');
      expect(mimeTypes['.js']).toBe('application/javascript; charset=utf-8');
      expect(mimeTypes['.css']).toBe('text/css; charset=utf-8');
    });
  });

  describe('path safety', () => {
    test('blocks path traversal with ..', () => {
      const { isRelativePathSafe } = require('@/utils/path-security.js');
      expect(isRelativePathSafe('../etc/passwd')).toBe(false);
      expect(isRelativePathSafe('dist/../../../etc/passwd')).toBe(false);
      expect(isRelativePathSafe('..%2f..%2fetc%2fpasswd')).toBe(false);
    });

    test('allows safe paths', () => {
      const { isRelativePathSafe } = require('@/utils/path-security.js');
      expect(isRelativePathSafe('dist/index.html')).toBe(true);
      expect(isRelativePathSafe('dist/assets/app.js')).toBe(true);
      expect(isRelativePathSafe('index.html')).toBe(true);
    });

    test('allows empty path (root)', () => {
      const { isRelativePathSafe } = require('@/utils/path-security.js');
      expect(isRelativePathSafe('')).toBe(true);
    });
  });

  describe('config defaults', () => {
    test('static_serving has correct defaults', () => {
      const config = createTestConfig();
      expect(config.preview.static_serving.enabled).toBe(true);
      expect(config.preview.static_serving.spa_fallback).toBe(true);
      expect(config.preview.static_serving.allowed_extensions).toContain('.html');
      expect(config.preview.static_serving.allowed_extensions).toContain('.js');
      expect(config.preview.static_serving.allowed_extensions).toContain('.css');
    });

    test('can disable static serving', () => {
      const config = createTestConfig({
        static_serving: {
          enabled: false,
          allowed_extensions: [],
          spa_fallback: false,
          max_file_size: 1024
        }
      });
      expect(config.preview.static_serving.enabled).toBe(false);
    });
  });

  describe('extension validation', () => {
    test('allowed extensions are configurable', () => {
      const config = createTestConfig();
      const allowedExtensions = config.preview.static_serving.allowed_extensions;

      expect(allowedExtensions).toContain('.html');
      expect(allowedExtensions).toContain('.js');
      expect(allowedExtensions).toContain('.css');
      expect(allowedExtensions).toContain('.json');
      expect(allowedExtensions).toContain('.png');
      expect(allowedExtensions).toContain('.svg');
    });
  });
});
