import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_CONFIG_DIR } from '../test-setup.js';
import { findSessionDefinition, getFullPath, loadConfig } from './config.js';

// Top-level regex patterns for linter compliance
const FAILED_TO_LOAD_CONFIG_REGEX = /Failed to load config/;

describe('config', () => {
  beforeEach(() => {
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
    mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  describe('loadConfig', () => {
    test('uses zod defaults for missing fields', () => {
      // Test that zod defaults are applied for fields not in config file
      const configPath = join(TEST_CONFIG_DIR, 'minimal.yaml');
      writeFileSync(configPath, 'base_path: /custom\n');

      const config = loadConfig(configPath);

      // Custom value from file
      expect(config.base_path).toBe('/custom');
      // Default values from zod schema
      expect(config.daemon_port).toBe(7680);
      expect(config.daemon_manager).toBe('direct');
    });

    test('throws when specified config file does not exist', () => {
      expect(() => loadConfig('/nonexistent/path.yaml')).toThrow();
    });

    test('loads config from yaml file', () => {
      const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
      const yaml = `
base_path: /custom-path
daemon_port: 9000
sessions:
  - name: test-session
    dir: /home/test
    path: /test
`;
      writeFileSync(configPath, yaml);

      const config = loadConfig(configPath);

      expect(config.base_path).toBe('/custom-path');
      expect(config.daemon_port).toBe(9000);
      expect(config.sessions).toHaveLength(1);
      expect(config.sessions[0].name).toBe('test-session');
    });

    test('uses defaults for missing fields', () => {
      const configPath = join(TEST_CONFIG_DIR, 'partial.yaml');
      writeFileSync(configPath, 'daemon_port: 9000\n');

      const config = loadConfig(configPath);

      expect(config.base_path).toBe('/bunterm');
      expect(config.daemon_port).toBe(9000);
    });

    test('loads listen_sockets configuration', () => {
      const configPath = join(TEST_CONFIG_DIR, 'sockets.yaml');
      const yaml = `
listen_sockets:
  - /run/bunterm.sock
  - /tmp/bunterm-alt.sock
`;
      writeFileSync(configPath, yaml);

      const config = loadConfig(configPath);

      expect(config.listen_sockets).toHaveLength(2);
      expect(config.listen_sockets[0]).toBe('/run/bunterm.sock');
      expect(config.listen_sockets[1]).toBe('/tmp/bunterm-alt.sock');
    });

    test('defaults listen_sockets to empty array', () => {
      const config = loadConfig();

      expect(config.listen_sockets).toEqual([]);
    });

    test('loads toolbar configuration', () => {
      const configPath = join(TEST_CONFIG_DIR, 'terminal_ui.yaml');
      const yaml = `
terminal_ui:
  font_size_default_mobile: 28
  font_size_default_pc: 16
  font_size_min: 8
  font_size_max: 64
  double_tap_delay: 400
`;
      writeFileSync(configPath, yaml);

      const config = loadConfig(configPath);

      expect(config.terminal_ui.font_size_default_mobile).toBe(28);
      expect(config.terminal_ui.font_size_default_pc).toBe(16);
      expect(config.terminal_ui.font_size_min).toBe(8);
      expect(config.terminal_ui.font_size_max).toBe(64);
      expect(config.terminal_ui.double_tap_delay).toBe(400);
    });

    test('defaults toolbar to default values', () => {
      const config = loadConfig();

      expect(config.terminal_ui.font_size_default_mobile).toBe(32);
      expect(config.terminal_ui.font_size_default_pc).toBe(14);
      expect(config.terminal_ui.font_size_min).toBe(10);
      expect(config.terminal_ui.font_size_max).toBe(48);
      expect(config.terminal_ui.double_tap_delay).toBe(300);
    });

    test('partially overrides toolbar defaults', () => {
      const configPath = join(TEST_CONFIG_DIR, 'toolbar-partial.yaml');
      const yaml = `
terminal_ui:
  font_size_default_mobile: 36
`;
      writeFileSync(configPath, yaml);

      const config = loadConfig(configPath);

      expect(config.terminal_ui.font_size_default_mobile).toBe(36);
      expect(config.terminal_ui.font_size_default_pc).toBe(14); // default
      expect(config.terminal_ui.font_size_min).toBe(10); // default
    });

    test('error message includes hint for YAML parse errors', () => {
      const configPath = join(TEST_CONFIG_DIR, 'bad-yaml.yaml');
      writeFileSync(configPath, '{ invalid yaml content');

      expect(() => loadConfig(configPath)).toThrow(FAILED_TO_LOAD_CONFIG_REGEX);
    });

    test('error message includes hint for Zod validation errors', () => {
      const configPath = join(TEST_CONFIG_DIR, 'invalid-type.yaml');
      writeFileSync(configPath, 'daemon_port: not-a-number\n');

      expect(() => loadConfig(configPath)).toThrow(FAILED_TO_LOAD_CONFIG_REGEX);
    });

    test('throws on invalid yaml', () => {
      const configPath = join(TEST_CONFIG_DIR, 'invalid.yaml');
      writeFileSync(configPath, '{ invalid yaml content');

      expect(() => loadConfig(configPath)).toThrow();
    });
  });

  describe('getFullPath', () => {
    test('combines base_path and session path', () => {
      const config = { base_path: '/bunterm', daemon_port: 7680 };

      expect(getFullPath(config, '/seminar')).toBe('/bunterm/seminar');
      expect(getFullPath(config, '/room1')).toBe('/bunterm/room1');
    });

    test('handles base_path with trailing slash', () => {
      const config = { base_path: '/bunterm/', daemon_port: 7680 };

      expect(getFullPath(config, '/seminar')).toBe('/bunterm/seminar');
    });

    test('handles session path without leading slash', () => {
      const config = { base_path: '/bunterm', daemon_port: 7680 };

      expect(getFullPath(config, 'seminar')).toBe('/bunterm/seminar');
    });
  });

  describe('findSessionDefinition', () => {
    test('finds session by name', () => {
      const config = {
        base_path: '/',
        daemon_port: 7680,
        sessions: [
          { name: 'session-a', dir: '/a', path: '/a' },
          { name: 'session-b', dir: '/b', path: '/b' }
        ]
      };

      const found = findSessionDefinition(config, 'session-b');

      expect(found).toBeDefined();
      expect(found?.name).toBe('session-b');
      expect(found?.dir).toBe('/b');
    });

    test('returns undefined for non-existent session', () => {
      const config = {
        base_path: '/',
        daemon_port: 7680,
        sessions: [{ name: 'session-a', dir: '/a', path: '/a' }]
      };

      const found = findSessionDefinition(config, 'non-existent');

      expect(found).toBeUndefined();
    });

    test('returns undefined when sessions array is empty', () => {
      const config = { base_path: '/', daemon_port: 7680, sessions: [] };

      const found = findSessionDefinition(config, 'any');

      expect(found).toBeUndefined();
    });
  });
});
