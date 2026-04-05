/**
 * Tests for buildShellEnvInjection()
 *
 * Shell environment injection for automatic shell-integration sourcing.
 * Uses PROMPT_COMMAND for bash and ZDOTDIR temp-dir for zsh.
 *
 * Behavior by shell type:
 * - bash:    sets PROMPT_COMMAND to source /path/to/bash.sh
 * - zsh:     sets ZDOTDIR to a temp dir containing .zshrc and .zshenv
 *            that source bunterm zsh.sh and then delegate to the user's files
 * - unknown: empty env (no injection)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { buildShellEnvInjection } from './shell-env-injection.js';
import { getBashIntegrationPath } from './shell-integration/index.js';

// Track temp dirs created during zsh tests for cleanup
const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in tests
    }
  }
  createdDirs.length = 0;
});

// === Unit Tests: bash ===

describe('buildShellEnvInjection - bash', () => {
  test('bash command sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['bash']);
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('/bin/bash sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['/bin/bash']);
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('PROMPT_COMMAND contains the bash.sh path', () => {
    const result = buildShellEnvInjection(['bash']);
    const bashShPath = getBashIntegrationPath();
    expect(result.env.PROMPT_COMMAND).toContain(bashShPath);
  });

  test('PROMPT_COMMAND contains "source" command', () => {
    const result = buildShellEnvInjection(['bash', '-i']);
    expect(result.env.PROMPT_COMMAND).toContain('source');
  });

  test('PROMPT_COMMAND is a valid source command string', () => {
    const result = buildShellEnvInjection(['bash']);
    const bashShPath = getBashIntegrationPath();
    expect(result.env.PROMPT_COMMAND).toBe(`source ${bashShPath}`);
  });

  test('bash -i (interactive flag) still sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['bash', '-i']);
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('/usr/local/bin/bash sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['/usr/local/bin/bash']);
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });
});

// === Unit Tests: bash via tmux multiplexer ===

describe('buildShellEnvInjection - tmux + SHELL=bash', () => {
  test('tmux with SHELL=/bin/bash sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session', '-A', '-s', 'main'], {
      SHELL: '/bin/bash'
    });
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('tmux with SHELL=/bin/bash: PROMPT_COMMAND contains bash.sh path', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], { SHELL: '/bin/bash' });
    const bashShPath = getBashIntegrationPath();
    expect(result.env.PROMPT_COMMAND).toContain(bashShPath);
  });

  test('zellij with SHELL=/bin/bash sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['zellij'], { SHELL: '/bin/bash' });
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('screen with SHELL=/usr/local/bin/bash sets PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['screen', '-S', 'mysession'], {
      SHELL: '/usr/local/bin/bash'
    });
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });
});

// === Unit Tests: unknown shell → no injection ===

describe('buildShellEnvInjection - unknown shell', () => {
  test('unknown command returns empty env object', () => {
    const result = buildShellEnvInjection(['python3']);
    expect(result.env).toEqual({});
  });

  test('empty command array returns empty env object', () => {
    const result = buildShellEnvInjection([]);
    expect(result.env).toEqual({});
  });

  test('node command returns empty env object', () => {
    const result = buildShellEnvInjection(['node', 'server.js']);
    expect(result.env).toEqual({});
  });

  test('tmux without SHELL env returns empty env object', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], {});
    expect(result.env).toEqual({});
  });

  test('fish shell returns empty env object (unsupported)', () => {
    const result = buildShellEnvInjection(['fish']);
    expect(result.env).toEqual({});
  });
});

// === Unit Tests: zsh → ZDOTDIR temp-directory injection ===

describe('buildShellEnvInjection - zsh env vars', () => {
  test('zsh command sets ZDOTDIR to a temp directory', () => {
    const result = buildShellEnvInjection(['zsh']);
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env).toHaveProperty('ZDOTDIR');
    expect(result.env.ZDOTDIR).toMatch(/^\/tmp\/bunterm-zsh-/);
  });

  test('/bin/zsh sets ZDOTDIR', () => {
    const result = buildShellEnvInjection(['/bin/zsh']);
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env).toHaveProperty('ZDOTDIR');
    expect(result.env.ZDOTDIR).toMatch(/^\/tmp\/bunterm-zsh-/);
  });

  test('/usr/bin/zsh sets ZDOTDIR', () => {
    const result = buildShellEnvInjection(['/usr/bin/zsh']);
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env).toHaveProperty('ZDOTDIR');
  });

  test('zsh sets USER_ZDOTDIR to original ZDOTDIR from env', () => {
    const result = buildShellEnvInjection(['zsh'], { ZDOTDIR: '/home/user/.config/zsh' });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env.USER_ZDOTDIR).toBe('/home/user/.config/zsh');
  });

  test('zsh sets USER_ZDOTDIR to HOME when ZDOTDIR is not set', () => {
    const result = buildShellEnvInjection(['zsh'], { HOME: '/home/testuser' });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env.USER_ZDOTDIR).toBe('/home/testuser');
  });

  test('zsh falls back USER_ZDOTDIR to /root when neither ZDOTDIR nor HOME is set', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env.USER_ZDOTDIR).toBe('/root');
  });

  test('cleanupDir is set and matches ZDOTDIR', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.cleanupDir).toBeDefined();
    expect(result.cleanupDir).toBe(result.env.ZDOTDIR);
  });

  test('each call produces a unique temp directory', () => {
    const r1 = buildShellEnvInjection(['zsh'], {});
    const r2 = buildShellEnvInjection(['zsh'], {});
    if (r1.cleanupDir) createdDirs.push(r1.cleanupDir);
    if (r2.cleanupDir) createdDirs.push(r2.cleanupDir);

    expect(r1.env.ZDOTDIR).not.toBe(r2.env.ZDOTDIR);
  });
});

describe('buildShellEnvInjection - zsh .zshrc creation', () => {
  test('creates .zshrc inside the temp ZDOTDIR', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(existsSync(`${result.env.ZDOTDIR}/.zshrc`)).toBe(true);
  });

  test('.zshrc contains source command for bunterm zsh.sh', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshrc`, 'utf-8');
    expect(content).toContain('source "');
    expect(content).toContain('zsh.sh"');
  });

  test('.zshrc sources a path that exists on disk', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshrc`, 'utf-8');
    const match = content.match(/source "([^"]+zsh\.sh)"/);
    expect(match).not.toBeNull();
    if (match) {
      expect(existsSync(match[1])).toBe(true);
    }
  });

  test('.zshrc restores ZDOTDIR to USER_ZDOTDIR', () => {
    const result = buildShellEnvInjection(['zsh'], { HOME: '/home/alice' });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshrc`, 'utf-8');
    expect(content).toContain('ZDOTDIR="${USER_ZDOTDIR}"');
  });

  test('.zshrc conditionally sources user .zshrc', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshrc`, 'utf-8');
    expect(content).toContain('${ZDOTDIR}/.zshrc');
    expect(content).toContain('source "${ZDOTDIR}/.zshrc"');
  });
});

describe('buildShellEnvInjection - zsh .zshenv creation', () => {
  test('creates .zshenv inside the temp ZDOTDIR', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(existsSync(`${result.env.ZDOTDIR}/.zshenv`)).toBe(true);
  });

  test('.zshenv restores ZDOTDIR to USER_ZDOTDIR', () => {
    const result = buildShellEnvInjection(['zsh'], { HOME: '/home/bob' });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshenv`, 'utf-8');
    expect(content).toContain('ZDOTDIR="${USER_ZDOTDIR}"');
  });

  test('.zshenv conditionally sources user .zshenv', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    const content = readFileSync(`${result.env.ZDOTDIR}/.zshenv`, 'utf-8');
    expect(content).toContain('${ZDOTDIR}/.zshenv');
    expect(content).toContain('source "${ZDOTDIR}/.zshenv"');
  });
});

// === Unit Tests: zsh via tmux multiplexer ===

describe('buildShellEnvInjection - tmux + SHELL=zsh', () => {
  test('tmux with SHELL=/bin/zsh sets ZDOTDIR', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], { SHELL: '/bin/zsh' });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env).toHaveProperty('ZDOTDIR');
    expect(result.env.ZDOTDIR).toMatch(/^\/tmp\/bunterm-zsh-/);
  });

  test('tmux + zsh uses original ZDOTDIR from env as USER_ZDOTDIR', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], {
      SHELL: '/bin/zsh',
      ZDOTDIR: '/custom/zdotdir',
      HOME: '/home/user'
    });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env.USER_ZDOTDIR).toBe('/custom/zdotdir');
  });

  test('tmux + zsh uses HOME as USER_ZDOTDIR when no ZDOTDIR', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], {
      SHELL: '/bin/zsh',
      HOME: '/home/user'
    });
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);

    expect(result.env.USER_ZDOTDIR).toBe('/home/user');
  });

  test('tmux with SHELL=/bin/bash does NOT set ZDOTDIR', () => {
    const result = buildShellEnvInjection(['tmux', 'new-session'], { SHELL: '/bin/bash' });
    expect(result.env).not.toHaveProperty('ZDOTDIR');
  });
});

// === Unit Tests: return type shape ===

describe('buildShellEnvInjection - return type', () => {
  test('always returns an object with env property', () => {
    const result = buildShellEnvInjection(['bash']);
    expect(result).toHaveProperty('env');
    expect(typeof result.env).toBe('object');
    expect(result.env).not.toBeNull();
  });

  test('env is a plain Record<string, string> (no inherited properties)', () => {
    const result = buildShellEnvInjection(['bash']);
    // All values must be strings
    for (const value of Object.values(result.env)) {
      expect(typeof value).toBe('string');
    }
  });

  test('env for unknown shell is exactly {} (no extra keys)', () => {
    const result = buildShellEnvInjection(['python3']);
    expect(Object.keys(result.env)).toHaveLength(0);
  });

  test('env for bash has exactly one key: PROMPT_COMMAND', () => {
    const result = buildShellEnvInjection(['bash']);
    expect(Object.keys(result.env)).toEqual(['PROMPT_COMMAND']);
  });

  test('zsh result has cleanupDir defined', () => {
    const result = buildShellEnvInjection(['zsh'], {});
    if (result.cleanupDir) createdDirs.push(result.cleanupDir);
    expect(result.cleanupDir).toBeDefined();
  });

  test('bash result has no cleanupDir', () => {
    const result = buildShellEnvInjection(['bash']);
    expect(result.cleanupDir).toBeUndefined();
  });

  test('unknown shell result has no cleanupDir', () => {
    const result = buildShellEnvInjection(['fish']);
    expect(result.cleanupDir).toBeUndefined();
  });
});

// === Edge cases ===

describe('buildShellEnvInjection - edge cases', () => {
  test('env parameter undefined does not throw', () => {
    expect(() => buildShellEnvInjection(['bash'], undefined)).not.toThrow();
  });

  test('bash with undefined env still sets PROMPT_COMMAND (no multiplexer lookup)', () => {
    const result = buildShellEnvInjection(['bash'], undefined);
    expect(result.env).toHaveProperty('PROMPT_COMMAND');
  });

  test('multiplexer without SHELL in env returns empty env', () => {
    const result = buildShellEnvInjection(['tmux'], undefined);
    expect(result.env).toEqual({});
  });

  test('PROMPT_COMMAND value does not have trailing newline', () => {
    const result = buildShellEnvInjection(['bash']);
    expect(result.env.PROMPT_COMMAND).not.toMatch(/\n$/);
  });

  test('PROMPT_COMMAND does not include shell-integration guard variable', () => {
    // The guard (__BUNTERM_SHELL_INTEGRATION__) is inside bash.sh itself
    // PROMPT_COMMAND should be a clean source command
    const result = buildShellEnvInjection(['bash']);
    expect(result.env.PROMPT_COMMAND).not.toContain('__BUNTERM_SHELL_INTEGRATION__');
  });
});
