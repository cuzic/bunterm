import { describe, expect, test } from 'bun:test';
import type { Config, SessionState } from '@/config/types.js';
import { generateJsonResponse, generatePortalHtml } from './portal.js';

describe('portal', () => {
  const baseConfig: Config = {
    base_path: '/ttyd-mux',
    base_port: 7600,
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1'],
    listen_sockets: [],
    auto_attach: true,
    sessions: [],
    proxy_mode: 'proxy',
    caddy_admin_api: 'http://localhost:2019',
    tmux_mode: 'auto',
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
    tabs: {
      enabled: false,
      orientation: 'vertical',
      position: 'left',
      tab_width: 200,
      tab_height: 40,
      auto_refresh_interval: 5000,
      preload_iframes: false,
      show_session_info: true
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
    }
  };

  describe('generatePortalHtml', () => {
    test('generates HTML with no sessions', () => {
      const html = generatePortalHtml(baseConfig, []);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>ttyd-mux</title>');
      expect(html).toContain('No active sessions');
      expect(html).toContain('ttyd-mux up');
    });

    test('generates HTML with sessions', () => {
      const sessions: SessionState[] = [
        {
          name: 'test-session',
          pid: 12345,
          port: 7601,
          path: '/test',
          dir: '/home/user/test',
          started_at: '2024-01-01T00:00:00Z'
        }
      ];

      const html = generatePortalHtml(baseConfig, sessions);

      expect(html).toContain('test-session');
      expect(html).toContain('/ttyd-mux/test/');
      expect(html).toContain(':7601');
      expect(html).toContain('/home/user/test');
      expect(html).not.toContain('No active sessions');
    });

    test('generates correct links with base_path', () => {
      const sessions: SessionState[] = [
        {
          name: 'seminar',
          pid: 12345,
          port: 7601,
          path: '/seminar',
          dir: '/home/user/seminar',
          started_at: '2024-01-01T00:00:00Z'
        }
      ];

      const html = generatePortalHtml(baseConfig, sessions);

      expect(html).toContain('href="/ttyd-mux/seminar/"');
    });

    test('escapes HTML in session names', () => {
      const sessions: SessionState[] = [
        {
          name: '<script>alert("xss")</script>',
          pid: 12345,
          port: 7601,
          path: '/test',
          dir: '/home/user/test',
          started_at: '2024-01-01T00:00:00Z'
        }
      ];

      const html = generatePortalHtml(baseConfig, sessions);

      // Malicious script content should be escaped
      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;alert');
      expect(html).toContain('&lt;script&gt;');
    });

    test('escapes HTML in directory paths', () => {
      const sessions: SessionState[] = [
        {
          name: 'test',
          pid: 12345,
          port: 7601,
          path: '/test',
          dir: '/home/<user>/test',
          started_at: '2024-01-01T00:00:00Z'
        }
      ];

      const html = generatePortalHtml(baseConfig, sessions);

      expect(html).toContain('&lt;user&gt;');
    });

    test('includes multiple sessions', () => {
      const sessions: SessionState[] = [
        {
          name: 'session-1',
          pid: 12345,
          port: 7601,
          path: '/s1',
          dir: '/home/user/s1',
          started_at: '2024-01-01T00:00:00Z'
        },
        {
          name: 'session-2',
          pid: 12346,
          port: 7602,
          path: '/s2',
          dir: '/home/user/s2',
          started_at: '2024-01-01T00:00:00Z'
        },
        {
          name: 'session-3',
          pid: 12347,
          port: 7603,
          path: '/s3',
          dir: '/home/user/s3',
          started_at: '2024-01-01T00:00:00Z'
        }
      ];

      const html = generatePortalHtml(baseConfig, sessions);

      expect(html).toContain('session-1');
      expect(html).toContain('session-2');
      expect(html).toContain('session-3');
      expect(html).toContain(':7601');
      expect(html).toContain(':7602');
      expect(html).toContain(':7603');
    });

    test('includes refresh link', () => {
      const html = generatePortalHtml(baseConfig, []);

      expect(html).toContain('Refresh');
      expect(html).toContain('location.reload()');
    });
  });

  describe('generateJsonResponse', () => {
    test('generates formatted JSON', () => {
      const data = { key: 'value', number: 42 };

      const json = generateJsonResponse(data);

      expect(json).toBe('{\n  "key": "value",\n  "number": 42\n}');
    });

    test('handles arrays', () => {
      const data = [1, 2, 3];

      const json = generateJsonResponse(data);

      expect(JSON.parse(json)).toEqual([1, 2, 3]);
    });

    test('handles nested objects', () => {
      const data = {
        outer: {
          inner: {
            value: 'test'
          }
        }
      };

      const json = generateJsonResponse(data);
      const parsed = JSON.parse(json);

      expect(parsed.outer.inner.value).toBe('test');
    });

    test('handles null', () => {
      const json = generateJsonResponse(null);

      expect(json).toBe('null');
    });
  });
});
