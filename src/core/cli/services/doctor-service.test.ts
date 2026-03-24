import { describe, expect, it } from 'bun:test';
import type { Config } from '@/core/config/types.js';
import {
  DEFAULT_AI_CHAT_CONFIG,
  DEFAULT_DIRECTORY_BROWSER_CONFIG,
  DEFAULT_FILE_TRANSFER_CONFIG,
  DEFAULT_NATIVE_TERMINAL_CONFIG,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_PREVIEW_CONFIG,
  DEFAULT_SECURITY_CONFIG,
  DEFAULT_SENTRY_CONFIG,
  DEFAULT_TERMINAL_UI_CONFIG
} from '@/core/config/types.js';
import { SecurityCheck } from './doctor-service.js';

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    base_path: '/bunterm',
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1', '::1'],
    listen_sockets: [],
    sessions: [],
    caddy_admin_api: 'http://localhost:2019',
    daemon_manager: 'direct',
    terminal_ui: DEFAULT_TERMINAL_UI_CONFIG,
    notifications: DEFAULT_NOTIFICATION_CONFIG,
    file_transfer: DEFAULT_FILE_TRANSFER_CONFIG,
    preview: DEFAULT_PREVIEW_CONFIG,
    directory_browser: DEFAULT_DIRECTORY_BROWSER_CONFIG,
    sentry: DEFAULT_SENTRY_CONFIG,
    native_terminal: DEFAULT_NATIVE_TERMINAL_CONFIG,
    ai_chat: DEFAULT_AI_CHAT_CONFIG,
    security: DEFAULT_SECURITY_CONFIG,
    ...overrides
  };
}

describe('SecurityCheck', () => {
  const check = new SecurityCheck();

  it('passes when localhost only and auth disabled', () => {
    const config = createConfig({
      listen_addresses: ['127.0.0.1', '::1'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: false }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('localhost only, authentication optional');
  });

  it('passes when localhost only and auth enabled', () => {
    const config = createConfig({
      listen_addresses: ['127.0.0.1'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: true }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('WebSocket token authentication enabled');
  });

  it('fails when 0.0.0.0 and auth disabled', () => {
    const config = createConfig({
      listen_addresses: ['0.0.0.0'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: false }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('0.0.0.0');
    expect(result.hint).toContain('enable_ws_token_auth');
  });

  it('passes when 0.0.0.0 and auth enabled', () => {
    const config = createConfig({
      listen_addresses: ['0.0.0.0'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: true }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('WebSocket token authentication enabled');
  });

  it('fails when external IP and auth disabled', () => {
    const config = createConfig({
      listen_addresses: ['192.168.1.100'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: false }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('192.168.1.100');
    expect(result.message).toContain('認証が無効');
  });

  it('passes when external IP and auth enabled', () => {
    const config = createConfig({
      listen_addresses: ['192.168.1.100'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: true }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(true);
  });

  it('fails when :: (IPv6 all interfaces) and auth disabled', () => {
    const config = createConfig({
      listen_addresses: ['::'],
      security: { ...DEFAULT_SECURITY_CONFIG, enable_ws_token_auth: false }
    });

    const result = check.run({ config });

    expect(result.ok).toBe(false);
  });

  it('skips when config not loaded', () => {
    const result = check.run({});

    expect(result.ok).toBe(true);
    expect(result.message).toBe('config not loaded, skipped');
  });
});
