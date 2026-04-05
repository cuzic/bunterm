import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caddySnippetCommand } from './caddy.js';

/**
 * Creates a temporary config file with known values so tests are isolated
 * from the user's real ~/.config/bunterm/config.yaml.
 */
function createTempConfig(overrides: Record<string, unknown> = {}): {
  configPath: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'bunterm-test-'));
  const defaults = {
    base_path: '/bunterm',
    daemon_port: 7680
  };
  const content = Object.entries({ ...defaults, ...overrides })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const configPath = join(dir, 'config.yaml');
  writeFileSync(configPath, content, 'utf-8');
  return { configPath, cleanup: () => rmSync(dir, { recursive: true }) };
}

describe('caddySnippetCommand', () => {
  let consoleLogs: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let cleanup: () => void;
  let configPath: string;

  beforeEach(() => {
    consoleLogs = [];
    consoleLogSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLogs.push(args.join(' '));
    });
    const tmp = createTempConfig();
    configPath = tmp.configPath;
    cleanup = tmp.cleanup;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    cleanup();
  });

  // Helper to get full output as a single string
  function output(): string {
    return consoleLogs.join('\n');
  }

  describe('basic snippet (no caddy-security)', () => {
    test('outputs handle_path block for base path', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('handle_path /bunterm/*');
    });

    test('outputs reverse_proxy for daemon port', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('reverse_proxy localhost:7680');
    });

    test('outputs @ws_upgrade matcher block', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('@ws_upgrade {');
    });

    test('@ws_upgrade matcher includes Connection header check', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('header Connection *Upgrade*');
    });

    test('@ws_upgrade matcher includes Upgrade header check', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('header Upgrade websocket');
    });

    test('outputs handle @ws_upgrade block with direct reverse_proxy', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).toContain('handle @ws_upgrade {');
      expect(output()).toContain('reverse_proxy 127.0.0.1:7680');
    });

    test('handle @ws_upgrade block appears before the main handle_path block', () => {
      caddySnippetCommand({ config: configPath });

      const out = output();
      const wsIndex = out.indexOf('handle @ws_upgrade {');
      const mainIndex = out.indexOf('handle_path /bunterm/*');

      expect(wsIndex).toBeGreaterThanOrEqual(0);
      expect(mainIndex).toBeGreaterThan(wsIndex);
    });

    test('does not output @untrusted matcher without caddySecurity option', () => {
      caddySnippetCommand({ config: configPath });

      expect(output()).not.toContain('@untrusted');
    });
  });

  describe('snippet with caddySecurity: true option', () => {
    test('outputs @untrusted matcher block', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      expect(output()).toContain('@untrusted {');
    });

    test('@untrusted contains not header Upgrade websocket', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      expect(output()).toContain('not header Upgrade websocket');
    });

    test('outputs authorize with @untrusted', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      expect(output()).toContain('authorize with @untrusted');
    });

    test('@untrusted block appears before @ws_upgrade block', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      const out = output();
      const untrustedIndex = out.indexOf('@untrusted {');
      const wsIndex = out.indexOf('@ws_upgrade {');

      expect(untrustedIndex).toBeGreaterThanOrEqual(0);
      expect(wsIndex).toBeGreaterThan(untrustedIndex);
    });

    test('still outputs @ws_upgrade handler block', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      expect(output()).toContain('handle @ws_upgrade {');
    });

    test('still outputs main handle_path block', () => {
      caddySnippetCommand({ config: configPath, caddySecurity: true });

      expect(output()).toContain('handle_path /bunterm/*');
    });
  });

  describe('custom port configuration', () => {
    test('uses configured daemon port in @ws_upgrade reverse_proxy', () => {
      const tmp = createTempConfig({ base_path: '/bunterm', daemon_port: 9999 });
      caddySnippetCommand({ config: tmp.configPath });
      tmp.cleanup();

      expect(output()).toContain('reverse_proxy 127.0.0.1:9999');
      expect(output()).toContain('reverse_proxy localhost:9999');
    });

    test('uses configured base_path in handle_path block', () => {
      const tmp = createTempConfig({ base_path: '/myterm', daemon_port: 7680 });
      caddySnippetCommand({ config: tmp.configPath });
      tmp.cleanup();

      expect(output()).toContain('handle_path /myterm/*');
    });
  });
});
