import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_CONFIG_DIR } from '@/test-setup.js';
import { initConfigManager } from './config-manager.js';

describe('ConfigManager', () => {
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

  test('initializes with config file', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(
      configPath,
      `
daemon_port: 8000
terminal_ui:
  font_size_default_mobile: 36
`
    );

    const manager = initConfigManager(configPath);
    const config = manager.getConfig();

    expect(config.daemon_port).toBe(8000);
    expect(config.terminal_ui.font_size_default_mobile).toBe(36);
  });

  test('reload detects no changes', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(configPath, 'daemon_port: 8000\n');

    const manager = initConfigManager(configPath);
    const result = manager.reload();

    expect(result.success).toBe(true);
    expect(result.reloaded).toEqual([]);
    expect(result.requiresRestart).toEqual([]);
  });

  test('reload detects hot-reloadable changes', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(
      configPath,
      `
terminal_ui:
  font_size_default_mobile: 32
`
    );

    const manager = initConfigManager(configPath);

    // Modify config file
    writeFileSync(
      configPath,
      `
terminal_ui:
  font_size_default_mobile: 40
`
    );

    const result = manager.reload();

    expect(result.success).toBe(true);
    expect(result.reloaded).toContain('terminal_ui.font_size_default_mobile');
    expect(result.requiresRestart).toEqual([]);

    // Verify config was updated
    const config = manager.getConfig();
    expect(config.terminal_ui.font_size_default_mobile).toBe(40);
  });

  test('reload detects restart-required changes', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(configPath, 'daemon_port: 7680\n');

    const manager = initConfigManager(configPath);

    // Modify config file
    writeFileSync(configPath, 'daemon_port: 7681\n');

    const result = manager.reload();

    expect(result.success).toBe(true);
    expect(result.requiresRestart).toContain('daemon_port');
  });

  test('reload handles invalid config gracefully', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(configPath, 'daemon_port: 8000\n');

    const manager = initConfigManager(configPath);

    // Write invalid config
    writeFileSync(configPath, '{ invalid yaml');

    const result = manager.reload();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // Original config should be preserved
    const config = manager.getConfig();
    expect(config.daemon_port).toBe(8000);
  });

  test('reload detects multiple changes', () => {
    const configPath = join(TEST_CONFIG_DIR, 'config.yaml');
    writeFileSync(
      configPath,
      `
terminal_ui:
  font_size_default_mobile: 32
  font_size_default_pc: 14
`
    );

    const manager = initConfigManager(configPath);

    // Modify multiple settings
    writeFileSync(
      configPath,
      `
terminal_ui:
  font_size_default_mobile: 40
  font_size_default_pc: 16
daemon_port: 9000
`
    );

    const result = manager.reload();

    expect(result.success).toBe(true);
    expect(result.reloaded).toContain('terminal_ui.font_size_default_mobile');
    expect(result.reloaded).toContain('terminal_ui.font_size_default_pc');
    expect(result.requiresRestart).toContain('daemon_port');
  });
});
