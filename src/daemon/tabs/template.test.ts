import { describe, expect, test } from 'bun:test';
import type { Config, SessionState } from '@/config/types.js';
import { generateTabsHtml } from './template.js';

describe('generateTabsHtml', () => {
  const baseConfig: Config = {
    base_path: '/ttyd-mux',
    base_port: 7600,
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1'],
    listen_sockets: [],
    proxy_mode: 'proxy',
    caddy_admin_api: 'http://localhost:2019',
    terminal_ui: { enabled: true, keyboard_help: true },
    notifications: { enabled: false },
    tabs: {
      enabled: true,
      orientation: 'vertical',
      position: 'left',
      tab_width: 200,
      tab_height: 40,
      show_session_info: true
    }
  };

  const sessions: SessionState[] = [
    {
      name: 'session-1',
      pid: 1234,
      port: 7601,
      path: '/session-1',
      dir: '/home/user/project1',
      started_at: '2024-01-01T00:00:00Z'
    },
    {
      name: 'session-2',
      pid: 1235,
      port: 7602,
      path: '/session-2',
      dir: '/home/user/project2',
      started_at: '2024-01-01T00:00:00Z'
    }
  ];

  test('generates HTML document', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  test('includes tab items for each session', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    expect(html).toContain('data-session="session-1"');
    expect(html).toContain('data-session="session-2"');
  });

  test('marks current session as active', () => {
    const html = generateTabsHtml(baseConfig, sessions, 'session-2');
    // session-2 should be active
    expect(html).toContain('class="ttyd-tab active"');
  });

  test('uses first session as initial when current is null', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    // First session should be active
    expect(html).toContain('__TABS_CONFIG__');
    expect(html).toContain('"initialSession":"session-1"');
  });

  test('shows session info when configured', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    expect(html).toContain('/home/user/project1');
    expect(html).toContain('ttyd-tab-info');
  });

  test('hides session info when not configured', () => {
    const configWithoutInfo = {
      ...baseConfig,
      tabs: { ...baseConfig.tabs, show_session_info: false }
    };
    const html = generateTabsHtml(configWithoutInfo, sessions, null);
    // The tab items shouldn't contain the info span with directory
    expect(html).not.toContain(`<span class="ttyd-tab-info">`);
  });

  test('shows empty message when no sessions', () => {
    const html = generateTabsHtml(baseConfig, [], null);
    expect(html).toContain('No active sessions');
    expect(html).toContain('ttyd-mux up');
  });

  test('includes styles', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    expect(html).toContain('<style>');
  });

  test('includes client config script', () => {
    const html = generateTabsHtml(baseConfig, sessions, null);
    expect(html).toContain('window.__TABS_CONFIG__');
  });

  test('handles session with special characters', () => {
    const specialSessions: SessionState[] = [
      {
        name: 'session-<script>',
        pid: 1234,
        port: 7601,
        path: '/session',
        dir: '/home/user/<test>',
        started_at: '2024-01-01T00:00:00Z'
      }
    ];
    const html = generateTabsHtml(baseConfig, specialSessions, null);
    // Should escape HTML
    expect(html).toContain('&lt;script&gt;');
  });
});
