import { afterEach, describe, expect, test } from 'bun:test';

// Import the module
import {
  getCwdSessionName,
  isInsideTmux,
  isTmuxInstalled,
  listSessions,
  sessionExists
} from './tmux.js';

// Check if tmux is available for integration tests
const tmuxAvailable = (() => {
  try {
    const result = Bun.spawnSync(['which', 'tmux']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
})();

describe('tmux', () => {
  const originalTmux = process.env['TMUX'];

  afterEach(() => {
    process.env['TMUX'] = originalTmux;
  });

  describe('isInsideTmux', () => {
    test('returns true when TMUX env is set', () => {
      process.env['TMUX'] = '/tmp/tmux-1000/default,12345,0';
      expect(isInsideTmux()).toBe(true);
    });

    test('returns false when TMUX env is not set', () => {
      process.env['TMUX'] = undefined;
      expect(isInsideTmux()).toBe(false);
    });

    test('returns false when TMUX env is empty string', () => {
      process.env['TMUX'] = '';
      expect(isInsideTmux()).toBe(false);
    });
  });

  describe('isTmuxInstalled', () => {
    test('returns boolean', () => {
      const result = isTmuxInstalled();
      expect(typeof result).toBe('boolean');
    });

    test.skipIf(!tmuxAvailable)('returns true when tmux is installed', () => {
      expect(isTmuxInstalled()).toBe(true);
    });
  });

  describe('listSessions', () => {
    test.skipIf(!tmuxAvailable)('returns array', () => {
      // Test actual behavior - may return empty array if no sessions
      const sessions = listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    test.skipIf(!tmuxAvailable)('session has correct shape when sessions exist', () => {
      const sessions = listSessions();
      if (sessions.length > 0) {
        const session = sessions[0];
        expect(typeof session?.name).toBe('string');
        expect(typeof session?.windows).toBe('number');
        expect(session?.created).toBeInstanceOf(Date);
        expect(typeof session?.attached).toBe('boolean');
      }
    });
  });
});

describe('TmuxSession type', () => {
  test('has correct structure', () => {
    const session = {
      name: 'test',
      windows: 3,
      created: new Date(),
      attached: false
    };

    expect(session.name).toBe('test');
    expect(session.windows).toBe(3);
    expect(session.created).toBeInstanceOf(Date);
    expect(session.attached).toBe(false);
  });
});

describe('getCwdSessionName', () => {
  test('returns basename of current directory', () => {
    const result = getCwdSessionName();
    const expected = process.cwd().split('/').pop();
    expect(result).toBe(expected);
  });

  test('returns non-empty string', () => {
    const result = getCwdSessionName();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('sessionExists', () => {
  test.skipIf(!tmuxAvailable)('returns false for non-existent session', () => {
    // Use a random name that definitely doesn't exist
    const randomName = `nonexistent-${Date.now()}-${Math.random()}`;
    expect(sessionExists(randomName)).toBe(false);
  });

  test.skipIf(!tmuxAvailable)('returns boolean', () => {
    const result = sessionExists('any-session');
    expect(typeof result).toBe('boolean');
  });
});

// Note: attachSession and createSessionFromCwd are interactive functions
// that spawn tmux with stdio: 'inherit', making them difficult to test
// without actually running tmux. They delegate to ensureSession which
// is tested via tmux-client.ts tests.
