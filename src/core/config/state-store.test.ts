import { describe, expect, test } from 'bun:test';
import { createInMemoryStateStore } from './state-store.js';

describe('createInMemoryStateStore', () => {
  describe('path accessors', () => {
    test('getStateDir returns test path', () => {
      const store = createInMemoryStateStore();
      expect(store.getStateDir()).toBe('/tmp/test-state');
    });

    test('getSocketPath returns test socket path', () => {
      const store = createInMemoryStateStore();
      expect(store.getSocketPath()).toBe('/tmp/test-state/bunterm.sock');
    });
  });

  describe('state management', () => {
    test('loadState returns default state when empty', () => {
      const store = createInMemoryStateStore();
      const state = store.loadState();
      expect(state.daemon).toBeNull();
      expect(state.sessions).toEqual([]);
    });

    test('loadState returns initial state', () => {
      const store = createInMemoryStateStore({
        daemon: { pid: 123, port: 7680, started_at: '2024-01-01' },
        sessions: [
          {
            name: 'test',
            pid: 456,
            path: '/test',
            dir: '/home',
            started_at: '2024-01-01'
          }
        ]
      });
      const state = store.loadState();
      expect(state.daemon?.pid).toBe(123);
      expect(state.sessions.length).toBe(1);
    });

    test('saveState updates state', () => {
      const store = createInMemoryStateStore();
      store.saveState({
        daemon: { pid: 999, port: 7680, started_at: '2024-01-01' },
        sessions: []
      });
      const state = store.loadState();
      expect(state.daemon?.pid).toBe(999);
    });

    test('loadState returns a copy (immutable)', () => {
      const store = createInMemoryStateStore();
      const state1 = store.loadState();
      state1.sessions.push({
        name: 'modified',
        pid: 1,
        path: '/',
        dir: '/',
        started_at: ''
      });
      const state2 = store.loadState();
      expect(state2.sessions.length).toBe(0);
    });
  });

  describe('daemon state', () => {
    test('getDaemonState returns null when not set', () => {
      const store = createInMemoryStateStore();
      expect(store.getDaemonState()).toBeNull();
    });

    test('setDaemonState updates daemon state', () => {
      const store = createInMemoryStateStore();
      store.setDaemonState({ pid: 123, port: 7680, started_at: '2024-01-01' });
      expect(store.getDaemonState()?.pid).toBe(123);
    });

    test('clearDaemonState removes daemon state', () => {
      const store = createInMemoryStateStore({
        daemon: { pid: 123, port: 7680, started_at: '2024-01-01' }
      });
      store.clearDaemonState();
      expect(store.getDaemonState()).toBeNull();
    });
  });

  describe('session state', () => {
    test('addSession adds new session', () => {
      const store = createInMemoryStateStore();
      store.addSession({
        name: 'test',
        pid: 123,
        path: '/test',
        dir: '/home',
        started_at: '2024-01-01'
      });
      expect(store.getAllSessions().length).toBe(1);
      expect(store.getSession('test')?.pid).toBe(123);
    });

    test('addSession replaces session with same name', () => {
      const store = createInMemoryStateStore();
      store.addSession({
        name: 'test',
        pid: 123,
        path: '/test',
        dir: '/home',
        started_at: '2024-01-01'
      });
      store.addSession({
        name: 'test',
        pid: 456,
        path: '/test2',
        dir: '/home2',
        started_at: '2024-01-02'
      });
      expect(store.getAllSessions().length).toBe(1);
      expect(store.getSession('test')?.pid).toBe(456);
    });

    test('removeSession removes session', () => {
      const store = createInMemoryStateStore();
      store.addSession({
        name: 'test',
        pid: 123,
        path: '/test',
        dir: '/home',
        started_at: '2024-01-01'
      });
      store.removeSession('test');
      expect(store.getAllSessions().length).toBe(0);
      expect(store.getSession('test')).toBeUndefined();
    });

    test('getSession returns undefined for non-existent session', () => {
      const store = createInMemoryStateStore();
      expect(store.getSession('nonexistent')).toBeUndefined();
    });

    test('getSessionByDir finds session by directory', () => {
      const store = createInMemoryStateStore();
      store.addSession({
        name: 'test',
        pid: 123,
        path: '/test',
        dir: '/home/user/project',
        started_at: '2024-01-01'
      });
      expect(store.getSessionByDir('/home/user/project')?.name).toBe('test');
    });

    test('getSessionByDir returns undefined for unknown directory', () => {
      const store = createInMemoryStateStore();
      expect(store.getSessionByDir('/unknown')).toBeUndefined();
    });

    test('getAllSessions returns copy of sessions array', () => {
      const store = createInMemoryStateStore();
      store.addSession({
        name: 'test',
        pid: 123,
        path: '/test',
        dir: '/home',
        started_at: '2024-01-01'
      });
      const sessions = store.getAllSessions();
      sessions.push({ name: 'modified', pid: 1, path: '/', dir: '/', started_at: '' });
      expect(store.getAllSessions().length).toBe(1);
    });
  });

  describe('utilities', () => {
    test('getNextPath constructs path from basePath and name', () => {
      const store = createInMemoryStateStore();
      expect(store.getNextPath('/bunterm', 'my-project')).toBe('/bunterm/my-project');
    });

    test('getNextPath normalizes double slashes', () => {
      const store = createInMemoryStateStore();
      expect(store.getNextPath('/bunterm/', 'my-project')).toBe('/bunterm/my-project');
    });
  });

  describe('share state', () => {
    test('addShare adds new share', () => {
      const store = createInMemoryStateStore();
      store.addShare({
        token: 'test-token',
        sessionName: 'test-session',
        createdAt: '2024-01-01',
        expiresAt: '2024-01-02'
      });
      expect(store.getAllShares().length).toBe(1);
      expect(store.getShare('test-token')?.sessionName).toBe('test-session');
    });

    test('addShare replaces share with same token', () => {
      const store = createInMemoryStateStore();
      store.addShare({
        token: 'test-token',
        sessionName: 'session-1',
        createdAt: '2024-01-01',
        expiresAt: '2024-01-02'
      });
      store.addShare({
        token: 'test-token',
        sessionName: 'session-2',
        createdAt: '2024-01-02',
        expiresAt: '2024-01-03'
      });
      expect(store.getAllShares().length).toBe(1);
      expect(store.getShare('test-token')?.sessionName).toBe('session-2');
    });

    test('removeShare removes share', () => {
      const store = createInMemoryStateStore();
      store.addShare({
        token: 'test-token',
        sessionName: 'test-session',
        createdAt: '2024-01-01',
        expiresAt: '2024-01-02'
      });
      store.removeShare('test-token');
      expect(store.getAllShares().length).toBe(0);
      expect(store.getShare('test-token')).toBeUndefined();
    });

    test('removeShare does nothing for non-existent share', () => {
      const store = createInMemoryStateStore();
      store.removeShare('nonexistent');
      expect(store.getAllShares()).toEqual([]);
    });

    test('getShare returns undefined for non-existent share', () => {
      const store = createInMemoryStateStore();
      expect(store.getShare('nonexistent')).toBeUndefined();
    });

    test('getAllShares returns copy of shares array', () => {
      const store = createInMemoryStateStore();
      store.addShare({
        token: 'test-token',
        sessionName: 'test-session',
        createdAt: '2024-01-01',
        expiresAt: '2024-01-02'
      });
      const shares = store.getAllShares();
      shares.push({ token: 'modified', sessionName: 'x', createdAt: '', expiresAt: '' });
      expect(store.getAllShares().length).toBe(1);
    });
  });

  describe('push subscription state', () => {
    test('addPushSubscription adds new subscription', () => {
      const store = createInMemoryStateStore();
      store.addPushSubscription({
        id: 'sub-1',
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'auth1' },
        sessionName: 'test-session',
        createdAt: '2024-01-01'
      });
      expect(store.getAllPushSubscriptions().length).toBe(1);
      expect(store.getPushSubscription('sub-1')?.endpoint).toBe('https://example.com/push');
    });

    test('addPushSubscription replaces subscription with same endpoint', () => {
      const store = createInMemoryStateStore();
      store.addPushSubscription({
        id: 'sub-1',
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'auth1' },
        sessionName: 'session-1',
        createdAt: '2024-01-01'
      });
      store.addPushSubscription({
        id: 'sub-2',
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key2', auth: 'auth2' },
        sessionName: 'session-2',
        createdAt: '2024-01-02'
      });
      expect(store.getAllPushSubscriptions().length).toBe(1);
      expect(store.getPushSubscription('sub-2')?.sessionName).toBe('session-2');
    });

    test('removePushSubscription removes subscription', () => {
      const store = createInMemoryStateStore();
      store.addPushSubscription({
        id: 'sub-1',
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'auth1' },
        sessionName: 'test-session',
        createdAt: '2024-01-01'
      });
      store.removePushSubscription('sub-1');
      expect(store.getAllPushSubscriptions().length).toBe(0);
      expect(store.getPushSubscription('sub-1')).toBeUndefined();
    });

    test('removePushSubscription does nothing for non-existent subscription', () => {
      const store = createInMemoryStateStore();
      store.removePushSubscription('nonexistent');
      expect(store.getAllPushSubscriptions()).toEqual([]);
    });

    test('getPushSubscription returns undefined for non-existent subscription', () => {
      const store = createInMemoryStateStore();
      expect(store.getPushSubscription('nonexistent')).toBeUndefined();
    });

    test('getAllPushSubscriptions returns copy of subscriptions array', () => {
      const store = createInMemoryStateStore();
      store.addPushSubscription({
        id: 'sub-1',
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'auth1' },
        sessionName: 'test-session',
        createdAt: '2024-01-01'
      });
      const subscriptions = store.getAllPushSubscriptions();
      subscriptions.push({
        id: 'modified',
        endpoint: '',
        keys: { p256dh: '', auth: '' },
        sessionName: '',
        createdAt: ''
      });
      expect(store.getAllPushSubscriptions().length).toBe(1);
    });
  });
});
