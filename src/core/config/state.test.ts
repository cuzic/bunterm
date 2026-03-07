// Import test setup FIRST to set environment variables before any other imports
import { TEST_STATE_DIR, cleanupTestState, resetTestState } from '@/test-setup.js';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('state', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  describe('getStateDir / getSocketPath', () => {
    test('returns test directory when env var is set', async () => {
      const { getStateDir, getSocketPath } = await import('./state.js');

      expect(getStateDir()).toBe(TEST_STATE_DIR);
      expect(getSocketPath()).toBe(`${TEST_STATE_DIR}/bunterm.sock`);
    });
  });

  describe('loadState', () => {
    test('returns default state when file does not exist', async () => {
      const { loadState } = await import('./state.js');

      const state = loadState();

      expect(state.daemon).toBeNull();
      expect(state.sessions).toEqual([]);
    });

    test('returns saved state when file exists', async () => {
      const { loadState, saveState } = await import('./state.js');
      const testState = {
        daemon: { pid: 1234, port: 7680, started_at: '2024-01-01T00:00:00Z' },
        sessions: []
      };
      saveState(testState);

      const state = loadState();

      expect(state.daemon?.pid).toBe(1234);
      expect(state.daemon?.port).toBe(7680);
    });

    test('returns default state when JSON is invalid', async () => {
      const { loadState, getStateDir } = await import('./state.js');
      const stateFile = join(getStateDir(), 'state.json');

      // Write invalid JSON to state file
      writeFileSync(stateFile, 'invalid json content');

      const state = loadState();

      expect(state.daemon).toBeNull();
      expect(state.sessions).toEqual([]);
    });
  });

  describe('saveState', () => {
    test('creates state file', async () => {
      const { saveState, getStateDir } = await import('./state.js');
      const stateFile = `${getStateDir()}/state.json`;

      saveState({ daemon: null, sessions: [] });

      expect(existsSync(stateFile)).toBe(true);
    });

    test('creates state directory if it does not exist', async () => {
      const { saveState, getStateDir } = await import('./state.js');
      const stateDir = getStateDir();

      // Remove the test state directory
      if (existsSync(stateDir)) {
        rmSync(stateDir, { recursive: true });
      }

      expect(existsSync(stateDir)).toBe(false);

      saveState({ daemon: null, sessions: [] });

      expect(existsSync(stateDir)).toBe(true);
    });
  });

  describe('daemon state operations', () => {
    test('setDaemonState and getDaemonState', async () => {
      const { setDaemonState, getDaemonState, clearDaemonState } = await import('./state.js');
      const daemon = { pid: 9999, port: 7680, started_at: '2024-01-01T00:00:00Z' };

      setDaemonState(daemon);
      const result = getDaemonState();

      expect(result?.pid).toBe(9999);
      expect(result?.port).toBe(7680);

      clearDaemonState();
      expect(getDaemonState()).toBeNull();
    });
  });

  describe('session state operations', () => {
    test('addSession and getSession', async () => {
      const { addSession, getSession, removeSession } = await import('./state.js');
      const session = {
        name: 'test-session',
        pid: 12345,
        path: '/test',
        dir: '/home/test',
        started_at: '2024-01-01T00:00:00Z'
      };

      addSession(session);
      const result = getSession('test-session');

      expect(result?.name).toBe('test-session');
      expect(result?.pid).toBe(12345);

      removeSession('test-session');
      expect(getSession('test-session')).toBeUndefined();
    });

    test('getAllSessions returns all sessions', async () => {
      const { addSession, getAllSessions } = await import('./state.js');

      addSession({
        name: 'session-1',
        pid: 1001,
        path: '/s1',
        dir: '/dir1',
        started_at: '2024-01-01T00:00:00Z'
      });
      addSession({
        name: 'session-2',
        pid: 1002,
        path: '/s2',
        dir: '/dir2',
        started_at: '2024-01-01T00:00:00Z'
      });

      const sessions = getAllSessions();

      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.name).sort()).toEqual(['session-1', 'session-2']);
    });

    test('getSessionByDir finds session by directory', async () => {
      const { addSession, getSessionByDir } = await import('./state.js');

      addSession({
        name: 'my-project',
        pid: 1001,
        path: '/my-project',
        dir: '/home/user/my-project',
        started_at: '2024-01-01T00:00:00Z'
      });

      const result = getSessionByDir('/home/user/my-project');

      expect(result?.name).toBe('my-project');
    });
  });

  describe('getNextPath', () => {
    test('combines base path and name', async () => {
      const { getNextPath } = await import('./state.js');

      const path = getNextPath('/bunterm', 'my-session');

      expect(path).toBe('/bunterm/my-session');
    });

    test('normalizes multiple slashes', async () => {
      const { getNextPath } = await import('./state.js');

      const path = getNextPath('/bunterm/', '/my-session');

      expect(path).toBe('/bunterm/my-session');
    });
  });
});

describe('share state operations', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('addShare and getShare', async () => {
    const { addShare, getShare, removeShare } = await import('./state.js');
    const share = {
      token: 'test-token-123',
      sessionName: 'test-session',
      createdAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-02T00:00:00Z'
    };

    addShare(share);
    const result = getShare('test-token-123');

    expect(result?.token).toBe('test-token-123');
    expect(result?.sessionName).toBe('test-session');

    removeShare('test-token-123');
    expect(getShare('test-token-123')).toBeUndefined();
  });

  test('getAllShares returns all shares', async () => {
    const { addShare, getAllShares } = await import('./state.js');

    addShare({
      token: 'token-1',
      sessionName: 'session-1',
      createdAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-02T00:00:00Z'
    });
    addShare({
      token: 'token-2',
      sessionName: 'session-2',
      createdAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-02T00:00:00Z'
    });

    const shares = getAllShares();

    expect(shares.length).toBe(2);
    expect(shares.map((s) => s.token).sort()).toEqual(['token-1', 'token-2']);
  });

  test('removeShare does nothing when shares is undefined', async () => {
    const { removeShare, getAllShares } = await import('./state.js');

    // Remove from empty state (no shares array)
    removeShare('nonexistent');

    expect(getAllShares()).toEqual([]);
  });
});

describe('push subscription operations', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  test('addPushSubscription and getPushSubscription', async () => {
    const { addPushSubscription, getPushSubscription, removePushSubscription } = await import(
      './state.js'
    );
    const subscription = {
      id: 'sub-123',
      endpoint: 'https://example.com/push',
      keys: {
        p256dh: 'test-p256dh-key',
        auth: 'test-auth-key'
      },
      sessionName: 'test-session',
      createdAt: '2024-01-01T00:00:00Z'
    };

    addPushSubscription(subscription);
    const result = getPushSubscription('sub-123');

    expect(result?.id).toBe('sub-123');
    expect(result?.endpoint).toBe('https://example.com/push');

    removePushSubscription('sub-123');
    expect(getPushSubscription('sub-123')).toBeUndefined();
  });

  test('getAllPushSubscriptions returns all subscriptions', async () => {
    const { addPushSubscription, getAllPushSubscriptions } = await import('./state.js');

    addPushSubscription({
      id: 'sub-1',
      endpoint: 'https://example.com/push1',
      keys: { p256dh: 'key1', auth: 'auth1' },
      sessionName: 'session-1',
      createdAt: '2024-01-01T00:00:00Z'
    });
    addPushSubscription({
      id: 'sub-2',
      endpoint: 'https://example.com/push2',
      keys: { p256dh: 'key2', auth: 'auth2' },
      sessionName: 'session-2',
      createdAt: '2024-01-01T00:00:00Z'
    });

    const subscriptions = getAllPushSubscriptions();

    expect(subscriptions.length).toBe(2);
    expect(subscriptions.map((s) => s.id).sort()).toEqual(['sub-1', 'sub-2']);
  });

  test('removePushSubscription does nothing when pushSubscriptions is undefined', async () => {
    const { removePushSubscription, getAllPushSubscriptions } = await import('./state.js');

    // Remove from empty state
    removePushSubscription('nonexistent');

    expect(getAllPushSubscriptions()).toEqual([]);
  });
});

describe('state type structures', () => {
  test('SessionState structure is correct', () => {
    const session = {
      name: 'test-session',
      pid: 12345,
      port: 7601,
      path: '/test',
      dir: '/home/test',
      started_at: new Date().toISOString()
    };

    expect(session.name).toBe('test-session');
    expect(session.pid).toBe(12345);
    expect(session.port).toBe(7601);
    expect(session.path).toBe('/test');
    expect(session.dir).toBe('/home/test');
    expect(typeof session.started_at).toBe('string');
  });

  test('DaemonState structure is correct', () => {
    const daemon = {
      pid: 99999,
      port: 7680,
      started_at: new Date().toISOString()
    };

    expect(daemon.pid).toBe(99999);
    expect(daemon.port).toBe(7680);
    expect(typeof daemon.started_at).toBe('string');
  });
});
