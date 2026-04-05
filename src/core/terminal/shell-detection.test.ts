/**
 * Tests for detectShellType()
 *
 * Shell detection priority:
 * 1. Executable name from command array (last element basename)
 * 2. $SHELL env var for multiplexers (tmux, zellij, screen)
 * 3. 'unknown' fallback
 */

import { describe, expect, test } from 'bun:test';
import { detectShellType } from './shell-detection.js';

// === Unit Tests: Direct shell commands ===

describe('detectShellType - bash detection', () => {
  test('["bash"] returns bash', () => {
    expect(detectShellType(['bash'])).toBe('bash');
  });

  test('["/bin/bash"] returns bash', () => {
    expect(detectShellType(['/bin/bash'])).toBe('bash');
  });

  test('["/usr/bin/bash", "-i"] returns bash', () => {
    expect(detectShellType(['/usr/bin/bash', '-i'])).toBe('bash');
  });

  test('["/usr/local/bin/bash"] returns bash', () => {
    expect(detectShellType(['/usr/local/bin/bash'])).toBe('bash');
  });
});

describe('detectShellType - zsh detection', () => {
  test('["zsh"] returns zsh', () => {
    expect(detectShellType(['zsh'])).toBe('zsh');
  });

  test('["/bin/zsh"] returns zsh', () => {
    expect(detectShellType(['/bin/zsh'])).toBe('zsh');
  });

  test('["/usr/bin/zsh"] returns zsh', () => {
    expect(detectShellType(['/usr/bin/zsh'])).toBe('zsh');
  });

  test('["/usr/bin/zsh", "-l"] returns zsh', () => {
    expect(detectShellType(['/usr/bin/zsh', '-l'])).toBe('zsh');
  });
});

// === Unit Tests: Unknown shells (no env var) ===

describe('detectShellType - unknown shells', () => {
  test('["python3"] returns unknown', () => {
    expect(detectShellType(['python3'])).toBe('unknown');
  });

  test('["node"] returns unknown', () => {
    expect(detectShellType(['node'])).toBe('unknown');
  });

  test('empty array returns unknown', () => {
    expect(detectShellType([])).toBe('unknown');
  });

  test('["fish"] returns unknown (unsupported shell)', () => {
    expect(detectShellType(['fish'])).toBe('unknown');
  });

  test('["sh"] returns unknown (plain sh not supported)', () => {
    expect(detectShellType(['sh'])).toBe('unknown');
  });
});

// === Unit Tests: Multiplexers with SHELL env var ===

describe('detectShellType - tmux with SHELL env', () => {
  test('tmux new-session with SHELL=/bin/bash returns bash', () => {
    expect(
      detectShellType(['tmux', 'new-session', '-A', '-s', 'test'], {
        SHELL: '/bin/bash'
      })
    ).toBe('bash');
  });

  test('tmux new-session with SHELL=/bin/zsh returns zsh', () => {
    expect(
      detectShellType(['tmux', 'new-session', '-A', '-s', 'test'], {
        SHELL: '/bin/zsh'
      })
    ).toBe('zsh');
  });

  test('tmux new-session without SHELL returns unknown', () => {
    expect(detectShellType(['tmux', 'new-session', '-A', '-s', 'test'], {})).toBe('unknown');
  });

  test('tmux new-session with SHELL env undefined returns unknown', () => {
    expect(detectShellType(['tmux', 'new-session', '-A', '-s', 'test'])).toBe('unknown');
  });

  test('tmux with SHELL=/usr/local/bin/bash returns bash', () => {
    expect(
      detectShellType(['tmux', 'attach-session', '-t', 'main'], {
        SHELL: '/usr/local/bin/bash'
      })
    ).toBe('bash');
  });
});

describe('detectShellType - zellij with SHELL env', () => {
  test('zellij with SHELL=/bin/zsh returns zsh', () => {
    expect(detectShellType(['zellij'], { SHELL: '/bin/zsh' })).toBe('zsh');
  });

  test('zellij with SHELL=/bin/bash returns bash', () => {
    expect(detectShellType(['zellij'], { SHELL: '/bin/bash' })).toBe('bash');
  });

  test('zellij without SHELL returns unknown', () => {
    expect(detectShellType(['zellij'])).toBe('unknown');
  });

  test('zellij with options and SHELL=/bin/zsh returns zsh', () => {
    expect(detectShellType(['zellij', '--layout', 'compact'], { SHELL: '/bin/zsh' })).toBe('zsh');
  });
});

describe('detectShellType - screen with SHELL env', () => {
  test('screen -dRR test with SHELL=/bin/bash returns bash', () => {
    expect(detectShellType(['screen', '-dRR', 'test'], { SHELL: '/bin/bash' })).toBe('bash');
  });

  test('screen with SHELL=/bin/zsh returns zsh', () => {
    expect(detectShellType(['screen', '-S', 'mysession'], { SHELL: '/bin/zsh' })).toBe('zsh');
  });

  test('screen without SHELL returns unknown', () => {
    expect(detectShellType(['screen'])).toBe('unknown');
  });
});

// === Edge cases ===

describe('detectShellType - edge cases', () => {
  test('command with path containing "bash" in directory name is not misidentified', () => {
    // /home/bash/myapp should not be detected as bash
    expect(detectShellType(['/home/bash/myapp'])).toBe('unknown');
  });

  test('command with path containing "zsh" in directory name is not misidentified', () => {
    // /opt/zsh-tools/launcher should not be detected as zsh
    expect(detectShellType(['/opt/zsh-tools/launcher'])).toBe('unknown');
  });

  test('SHELL env var ignored when command is a direct shell', () => {
    // Direct bash command; SHELL env should not override
    expect(detectShellType(['bash'], { SHELL: '/bin/zsh' })).toBe('bash');
  });

  test('env parameter undefined does not throw', () => {
    expect(() => detectShellType(['tmux'], undefined)).not.toThrow();
    expect(detectShellType(['tmux'], undefined)).toBe('unknown');
  });

  test('multiplexer with SHELL set to unknown shell returns unknown', () => {
    expect(detectShellType(['tmux', 'new-session'], { SHELL: '/bin/fish' })).toBe('unknown');
  });

  test('multiplexer with SHELL set to plain /bin/sh returns unknown', () => {
    expect(detectShellType(['tmux'], { SHELL: '/bin/sh' })).toBe('unknown');
  });
});
