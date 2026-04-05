import { describe, expect, test } from 'bun:test';
import { withEnvSync, withoutEnvSync } from '@/test-helpers/env-scope.js';
import { createMockProcessRunner } from './process-runner.js';
import {
  createMockTmuxClient,
  createTmuxClient,
  isValidSessionName,
  sanitizeSessionName
} from './tmux-client.js';

describe('createTmuxClient', () => {
  describe('isInsideTmux', () => {
    test('returns true when TMUX env is set', () => {
      withEnvSync({ TMUX: '/tmp/tmux-1000/default,12345,0' }, () => {
        const client = createTmuxClient();
        expect(client.isInsideTmux()).toBe(true);
      });
    });

    test('returns false when TMUX env is not set', () => {
      withoutEnvSync(['TMUX'], () => {
        const client = createTmuxClient();
        expect(client.isInsideTmux()).toBe(false);
      });
    });
  });

  describe('isInstalled', () => {
    test('returns true when tmux is found', () => {
      const mockRunner = createMockProcessRunner({
        execSync: () => '/usr/bin/tmux'
      });
      const client = createTmuxClient(mockRunner);
      expect(client.isInstalled()).toBe(true);
    });

    test('returns false when tmux is not found', () => {
      const mockRunner = createMockProcessRunner({
        execSync: () => {
          throw new Error('not found');
        }
      });
      const client = createTmuxClient(mockRunner);
      expect(client.isInstalled()).toBe(false);
    });
  });

  describe('listSessions', () => {
    test('parses tmux session list output', () => {
      const mockRunner = createMockProcessRunner({
        execSync: () => 'session1|3|1704067200|0\nsession2|1|1704153600|1\n'
      });
      const client = createTmuxClient(mockRunner);
      const sessions = client.listSessions();

      expect(sessions.length).toBe(2);
      expect(sessions[0].name).toBe('session1');
      expect(sessions[0].windows).toBe(3);
      expect(sessions[0].attached).toBe(false);
      expect(sessions[1].name).toBe('session2');
      expect(sessions[1].windows).toBe(1);
      expect(sessions[1].attached).toBe(true);
    });

    test('returns empty array when no sessions', () => {
      const mockRunner = createMockProcessRunner({
        execSync: () => {
          throw new Error('no server running');
        }
      });
      const client = createTmuxClient(mockRunner);
      expect(client.listSessions()).toEqual([]);
    });

    test('filters empty lines', () => {
      const mockRunner = createMockProcessRunner({
        execSync: () => 'session1|1|1704067200|0\n\n'
      });
      const client = createTmuxClient(mockRunner);
      const sessions = client.listSessions();
      expect(sessions.length).toBe(1);
    });
  });

  describe('sessionExists', () => {
    test('returns true when session exists', () => {
      const mockRunner = createMockProcessRunner({
        spawnSync: () => ({ status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null })
      });
      const client = createTmuxClient(mockRunner);
      expect(client.sessionExists('my-session')).toBe(true);
    });

    test('returns false when session does not exist', () => {
      const mockRunner = createMockProcessRunner({
        spawnSync: () => ({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null })
      });
      const client = createTmuxClient(mockRunner);
      expect(client.sessionExists('nonexistent')).toBe(false);
    });

    test('returns false for invalid session name', () => {
      const mockRunner = createMockProcessRunner();
      const client = createTmuxClient(mockRunner);
      expect(client.sessionExists('invalid;name')).toBe(false);
    });
  });

  describe('ensureSession', () => {
    test('creates session if it does not exist', () => {
      let createCalled = false;
      let hasSessionCalls = 0;

      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('has-session')) {
            hasSessionCalls++;
            return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args.includes('new-session')) {
            createCalled = true;
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      client.ensureSession('new-session');

      expect(hasSessionCalls).toBe(1);
      expect(createCalled).toBe(true);
    });

    test('does not create session if it already exists', () => {
      let createCalled = false;

      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('has-session')) {
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args.includes('new-session')) {
            createCalled = true;
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      client.ensureSession('existing-session');

      expect(createCalled).toBe(false);
    });

    test('passes cwd option when creating session', () => {
      let cwdArg = '';

      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('has-session')) {
            return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args.includes('new-session')) {
            const cwdIndex = args.indexOf('-c');
            if (cwdIndex >= 0) {
              cwdArg = args[cwdIndex + 1];
            }
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      client.ensureSession('new-session', '/home/user/project');

      expect(cwdArg).toBe('/home/user/project');
    });

    test('throws error for invalid session name', () => {
      const mockRunner = createMockProcessRunner();
      const client = createTmuxClient(mockRunner);
      expect(() => client.ensureSession('invalid;rm -rf /')).toThrow('Invalid session name');
    });

    test('throws error when session creation fails', () => {
      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('has-session')) {
            return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          if (args.includes('new-session')) {
            // Return non-zero status to simulate failure
            return { status: 1, stdout: '', stderr: 'error', pid: 0, output: [], signal: null };
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      expect(() => client.ensureSession('fail-session')).toThrow('Failed to create tmux session');
    });
  });

  describe('killSession', () => {
    test('returns true when session is killed successfully', () => {
      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('kill-session')) {
            return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      expect(client.killSession('my-session')).toBe(true);
    });

    test('returns false when session kill fails', () => {
      const mockRunner = createMockProcessRunner({
        spawnSync: (_cmd: string, args: string[]) => {
          if (args.includes('kill-session')) {
            return {
              status: 1,
              stdout: '',
              stderr: 'no session',
              pid: 0,
              output: [],
              signal: null
            };
          }
          return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
        }
      });

      const client = createTmuxClient(mockRunner);
      expect(client.killSession('nonexistent-session')).toBe(false);
    });

    test('returns false for invalid session name', () => {
      const mockRunner = createMockProcessRunner();
      const client = createTmuxClient(mockRunner);
      expect(client.killSession('invalid;name')).toBe(false);
    });
  });
});

describe('createMockTmuxClient', () => {
  test('provides default mock implementations', () => {
    const mock = createMockTmuxClient();
    expect(mock.isInsideTmux()).toBe(false);
    expect(mock.isInstalled()).toBe(true);
    expect(mock.listSessions()).toEqual([]);
    expect(mock.sessionExists('any')).toBe(false);
    // ensureSession should not throw
    expect(() => mock.ensureSession('test')).not.toThrow();
  });

  test('allows overriding methods', () => {
    const mock = createMockTmuxClient({
      isInsideTmux: () => true,
      listSessions: () => [{ name: 'test', windows: 1, created: new Date(), attached: false }]
    });
    expect(mock.isInsideTmux()).toBe(true);
    expect(mock.listSessions().length).toBe(1);
  });
});

describe('isValidSessionName', () => {
  test('accepts valid session names', () => {
    expect(isValidSessionName('my-session')).toBe(true);
    expect(isValidSessionName('session_1')).toBe(true);
    expect(isValidSessionName('Project.Name')).toBe(true);
    expect(isValidSessionName('abc123')).toBe(true);
  });

  test('rejects invalid session names', () => {
    expect(isValidSessionName('')).toBe(false);
    expect(isValidSessionName('session;rm -rf /')).toBe(false);
    expect(isValidSessionName('session`whoami`')).toBe(false);
    expect(isValidSessionName('session$(cat /etc/passwd)')).toBe(false);
    expect(isValidSessionName('session name')).toBe(false); // space
    expect(isValidSessionName('a'.repeat(65))).toBe(false); // too long
  });
});

describe('sanitizeSessionName', () => {
  test('returns valid names unchanged', () => {
    expect(sanitizeSessionName('my-session')).toBe('my-session');
    expect(sanitizeSessionName('session_1')).toBe('session_1');
  });

  test('sanitizes invalid characters', () => {
    expect(sanitizeSessionName('session;rm')).toBe('session-rm');
    expect(sanitizeSessionName('session name')).toBe('session-name');
    expect(sanitizeSessionName('session`test`')).toBe('session-test');
  });

  test('collapses multiple hyphens', () => {
    expect(sanitizeSessionName('a--b')).toBe('a-b');
    expect(sanitizeSessionName('a;;;b')).toBe('a-b');
  });

  test('trims leading/trailing hyphens', () => {
    expect(sanitizeSessionName('-session-')).toBe('session');
    expect(sanitizeSessionName(';session;')).toBe('session');
  });

  test('truncates to max length', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeSessionName(longName).length).toBe(64);
  });

  test('returns default for empty result', () => {
    expect(sanitizeSessionName(';;;')).toBe('session');
  });
});
