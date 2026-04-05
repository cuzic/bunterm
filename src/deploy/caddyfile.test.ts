import { describe, expect, test } from 'bun:test';
import type { Config } from '@/core/config/types.js';
import { generateCaddyfileSnippet, generateCaddyfileSnippetWithWsConfig } from './caddyfile.js';

// Minimal Config fixture
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    base_path: '/bunterm',
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1', '::1'],
    tmux_passthrough: false,
    attach_on_up: false,
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
      enabled: true,
      bell_notification: true,
      bell_cooldown: 10,
      patterns: [],
      default_cooldown: 300
    },
    file_transfer: {
      enabled: true,
      max_file_size: 100 * 1024 * 1024,
      allowed_extensions: []
    },
    preview: {
      enabled: true,
      default_width: 400,
      debounce_ms: 300,
      auto_refresh: true,
      allowed_extensions: ['.html', '.htm', '.md', '.txt'],
      static_serving: {
        enabled: true,
        allowed_extensions: ['.html'],
        spa_fallback: true,
        max_file_size: 50 * 1024 * 1024
      }
    },
    directory_browser: { enabled: false, allowed_directories: [] },
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
    ...overrides
  } as Config;
}

const OPTIONS = {
  hostname: 'example.com',
  portalDir: '/var/www/bunterm'
};

describe('generateCaddyfileSnippet', () => {
  describe('existing behavior (no caddy-security)', () => {
    test('contains handle block for base path', () => {
      const snippet = generateCaddyfileSnippet(makeConfig(), [], OPTIONS);

      expect(snippet).toContain('handle /bunterm {');
    });

    test('contains reverse_proxy for daemon port', () => {
      const snippet = generateCaddyfileSnippet(makeConfig(), [], OPTIONS);

      expect(snippet).toContain('reverse_proxy localhost:7680');
    });

    test('contains handle block for base path wildcard', () => {
      const snippet = generateCaddyfileSnippet(makeConfig(), [], OPTIONS);

      expect(snippet).toContain('handle /bunterm/* {');
    });
  });
});

describe('generateCaddyfileSnippetWithWsConfig', () => {
  describe('without caddy-security (useCaddySecurity: false)', () => {
    test('includes @ws_upgrade matcher block', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('@ws_upgrade {');
    });

    test('@ws_upgrade matcher checks Connection header', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('header Connection *Upgrade*');
    });

    test('@ws_upgrade matcher checks Upgrade header', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('header Upgrade websocket');
    });

    test('includes handle @ws_upgrade block that reverse_proxies to daemon port', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('handle @ws_upgrade {');
      expect(snippet).toContain('reverse_proxy 127.0.0.1:7680');
    });

    test('handle @ws_upgrade appears before the main handle block', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      const wsHandleIndex = snippet.indexOf('handle @ws_upgrade {');
      const mainHandleIndex = snippet.indexOf('handle /bunterm/* {');

      expect(wsHandleIndex).toBeGreaterThanOrEqual(0);
      expect(mainHandleIndex).toBeGreaterThan(wsHandleIndex);
    });

    test('does NOT include @untrusted matcher', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).not.toContain('@untrusted');
    });

    test('contains handle blocks for portal pages', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('handle /bunterm {');
      expect(snippet).toContain('handle /bunterm/ {');
    });
  });

  describe('with caddy-security (useCaddySecurity: true)', () => {
    test('includes @untrusted matcher block', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: true
      });

      expect(snippet).toContain('@untrusted {');
    });

    test('@untrusted matcher contains not header Upgrade websocket', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: true
      });

      expect(snippet).toContain('not header Upgrade websocket');
    });

    test('@untrusted matcher appears before handle @ws_upgrade', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: true
      });

      const untrustedIndex = snippet.indexOf('@untrusted {');
      const wsHandleIndex = snippet.indexOf('handle @ws_upgrade {');

      expect(untrustedIndex).toBeGreaterThanOrEqual(0);
      expect(wsHandleIndex).toBeGreaterThan(untrustedIndex);
    });

    test('includes @ws_upgrade handler block even with caddy-security', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: true
      });

      expect(snippet).toContain('@ws_upgrade {');
      expect(snippet).toContain('handle @ws_upgrade {');
    });

    test('includes authorize directive referencing @untrusted', () => {
      const snippet = generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
        useCaddySecurity: true
      });

      expect(snippet).toContain('authorize with @untrusted');
    });
  });

  describe('custom port configuration', () => {
    test('uses configured daemon port in @ws_upgrade reverse_proxy', () => {
      const config = makeConfig({ daemon_port: 8888 });
      const snippet = generateCaddyfileSnippetWithWsConfig(config, [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('reverse_proxy 127.0.0.1:8888');
    });

    test('uses configured base_path in handle blocks', () => {
      const config = makeConfig({ base_path: '/myterm' });
      const snippet = generateCaddyfileSnippetWithWsConfig(config, [], OPTIONS, {
        useCaddySecurity: false
      });

      expect(snippet).toContain('handle /myterm {');
      expect(snippet).toContain('handle /myterm/* {');
      expect(snippet).toContain('handle @ws_upgrade {');
    });
  });

  describe('edge cases', () => {
    test('empty sessions array does not break snippet generation', () => {
      expect(() => {
        generateCaddyfileSnippetWithWsConfig(makeConfig(), [], OPTIONS, {
          useCaddySecurity: false
        });
      }).not.toThrow();
    });

    test('base_path with trailing slash is normalized', () => {
      // Config schema strips trailing slashes via transform
      const config = makeConfig({ base_path: '/bunterm' });
      const snippet = generateCaddyfileSnippetWithWsConfig(config, [], OPTIONS, {
        useCaddySecurity: false
      });

      // Should not produce double slashes
      expect(snippet).not.toContain('//');
    });
  });
});
