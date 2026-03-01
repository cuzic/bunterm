// Import test setup FIRST to set environment variables before any other imports
import { cleanupTestState, resetTestState } from '@/test-setup.js';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { Config } from '@/config/types.js';
import { findSessionForPath } from './router.js';
import { createDaemonServer } from './server.js';

describe('server feature tests', () => {
  let server: Server;
  let serverPort: number;
  let baseUrl: string;

  const testConfig: Config = {
    base_path: '/ttyd-mux',
    base_port: 7600,
    daemon_port: 0, // Let OS assign port
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

  beforeAll(() => {
    resetTestState();
    server = createDaemonServer(testConfig);

    // Start server on random port
    return new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          serverPort = address.port;
          baseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        cleanupTestState();
        resolve();
      });
    });
  });

  describe('portal page', () => {
    test('GET /ttyd-mux/ returns HTML portal', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');

      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('ttyd-mux');
    });

    test('GET /ttyd-mux returns HTML portal (without trailing slash)', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('API endpoints', () => {
    test('GET /ttyd-mux/api/status returns daemon status', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/api/status`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(data).toHaveProperty('daemon');
      expect(data).toHaveProperty('sessions');
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    test('GET /ttyd-mux/api/sessions returns sessions list', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/api/sessions`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test('GET /ttyd-mux/api/unknown returns 404', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/api/unknown`);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('DELETE /ttyd-mux/api/sessions/nonexistent returns 400', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/api/sessions/nonexistent-session`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    test('POST /ttyd-mux/api/sessions with invalid JSON returns 400', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('PWA endpoints', () => {
    test('GET /ttyd-mux/manifest.json returns web app manifest', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/manifest.json`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/manifest+json');

      const manifest = await response.json();
      expect(manifest).toHaveProperty('name', 'ttyd-mux');
      expect(manifest).toHaveProperty('display', 'fullscreen');
      expect(manifest).toHaveProperty('start_url', '/ttyd-mux/');
      expect(manifest).toHaveProperty('icons');
    });

    test('GET /ttyd-mux/sw.js returns service worker script', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/sw.js`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/javascript');
      expect(response.headers.get('service-worker-allowed')).toBe('/');

      const script = await response.text();
      expect(script).toContain("addEventListener('install'");
      expect(script).toContain("addEventListener('fetch'");
    });

    test('GET /ttyd-mux/icon.svg returns SVG icon', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/icon.svg`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('image/svg+xml');
      expect(response.headers.get('cache-control')).toContain('max-age=86400');

      const svg = await response.text();
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    test('GET /ttyd-mux/icon-192.png returns PNG icon', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/icon-192.png`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toContain('max-age=86400');

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // PNG magic bytes
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50); // P
      expect(bytes[2]).toBe(0x4e); // N
      expect(bytes[3]).toBe(0x47); // G
    });

    test('GET /ttyd-mux/icon-512.png returns PNG icon', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/icon-512.png`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // PNG magic bytes
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
    });

    test('portal HTML includes PWA meta tags', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/`);
      const html = await response.text();

      expect(html).toContain('<link rel="manifest" href="/ttyd-mux/manifest.json">');
      expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
      expect(html).toContain('<meta name="theme-color" content="#00d9ff">');
      expect(html).toContain("navigator.serviceWorker.register('/ttyd-mux/sw.js')");
    });
  });

  describe('404 handling', () => {
    test('GET /unknown returns 404', async () => {
      const response = await fetch(`${baseUrl}/unknown-path`);

      expect(response.status).toBe(404);
    });

    test('GET /ttyd-mux/nonexistent-session returns 404', async () => {
      const response = await fetch(`${baseUrl}/ttyd-mux/nonexistent-session`);

      expect(response.status).toBe(404);
    });
  });
});

describe('findSessionForPath', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  const testConfig: Config = {
    base_path: '/ttyd-mux',
    base_port: 7600,
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1'],
    auto_attach: true,
    sessions: [],
    proxy_mode: 'proxy',
    caddy_admin_api: 'http://localhost:2019',
    tmux_mode: 'auto'
  };

  test('returns null when no sessions exist', () => {
    const result = findSessionForPath(testConfig, '/ttyd-mux/some-session');
    expect(result).toBeNull();
  });

  test('returns null for base path', () => {
    const result = findSessionForPath(testConfig, '/ttyd-mux');
    expect(result).toBeNull();
  });

  test('returns null for API path', () => {
    const result = findSessionForPath(testConfig, '/ttyd-mux/api/sessions');
    expect(result).toBeNull();
  });

  test('finds session by exact path match', async () => {
    const { addSession } = await import('../config/state.js');
    // Add a running session (use current pid so isProcessRunning returns true)
    addSession({
      name: 'test-session',
      pid: process.pid,
      port: 7601,
      path: '/test-session',
      dir: '/home/user/test',
      started_at: '2024-01-01T00:00:00Z'
    });

    const result = findSessionForPath(testConfig, '/ttyd-mux/test-session');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('test-session');
  });

  test('finds session by path prefix match', async () => {
    const { addSession } = await import('../config/state.js');
    addSession({
      name: 'prefix-session',
      pid: process.pid,
      port: 7602,
      path: '/prefix-session',
      dir: '/home/user/test',
      started_at: '2024-01-01T00:00:00Z'
    });

    const result = findSessionForPath(testConfig, '/ttyd-mux/prefix-session/ws');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('prefix-session');
  });
});
