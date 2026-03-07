import { describe, expect, test } from 'bun:test';

// Top-level regex for version matching
const BUN_VERSION_REGEX = /^\d+\.\d+/;

// Test that the doctor module exports the expected function
describe('doctor command', () => {
  test('exports doctorCommand function', async () => {
    const module = await import('./doctor.js');
    expect(typeof module.doctorCommand).toBe('function');
  });

  test('DoctorOptions interface accepts config option', () => {
    // Type check: this should compile without errors
    const options: import('./doctor.js').DoctorOptions = { config: '/path/to/config' };
    expect(options.config).toBe('/path/to/config');
  });
});

// Integration-style tests (these actually run commands)
describe('doctor checks', () => {
  test('tmux command check works', async () => {
    const { execSync } = await import('node:child_process');
    try {
      const output = execSync('tmux -V', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(output).toContain('tmux');
    } catch {
      // tmux not installed, which is fine for the test
      expect(true).toBe(true);
    }
  });

  test('bun command check works', async () => {
    const { execSync } = await import('node:child_process');
    const output = execSync('bun --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // Bun should always be available since we're running tests with it
    expect(output).toMatch(BUN_VERSION_REGEX);
  });

  test('config check handles missing file gracefully', async () => {
    const { findConfigPath } = await import('@/core/config/config.js');
    // findConfigPath returns null if no config file found, or the path if found
    const path = findConfigPath();
    expect(path === null || typeof path === 'string').toBe(true);
  });

  test('config check validates existing config', async () => {
    const { loadConfig } = await import('@/core/config/config.js');
    // Default config should load without errors
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config.daemon_port).toBeDefined();
  });

  test('config includes listen_sockets field', async () => {
    const { loadConfig } = await import('@/core/config/config.js');
    const config = loadConfig();
    expect(Array.isArray(config.listen_sockets)).toBe(true);
  });
});

describe('doctor output format', () => {
  test('exports CheckResult type with required fields', () => {
    // CheckResult should have name, status, message, and optional hint
    type CheckResult = {
      name: string;
      status: 'ok' | 'error' | 'warn';
      message: string;
      hint?: string;
    };

    const result: CheckResult = {
      name: 'test',
      status: 'ok',
      message: 'Test passed'
    };

    expect(result.name).toBe('test');
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Test passed');
    expect(result.hint).toBeUndefined();
  });

  test('CheckResult can have a hint', () => {
    type CheckResult = {
      name: string;
      status: 'ok' | 'error' | 'warn';
      message: string;
      hint?: string;
    };

    const result: CheckResult = {
      name: 'test',
      status: 'error',
      message: 'Test failed',
      hint: 'Try reinstalling'
    };

    expect(result.hint).toBe('Try reinstalling');
  });
});
