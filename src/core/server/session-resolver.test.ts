// Import test setup FIRST to set environment variables before any other imports

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Config, SessionState } from '@/core/config/types.js';
import { cleanupTestState, resetTestState } from '@/test-setup.js';
import { createSessionResolver } from './session-resolver.js';

describe('SessionResolver', () => {
  const baseConfig: Config = {
    base_path: '/bunterm',
    daemon_port: 7680,
    listen_addresses: ['127.0.0.1'],
    sessions: [
      { name: 'config-session', dir: '/home/user/config', path: '/config' },
      { name: 'another-session', dir: '/home/user/another', path: '/another' }
    ]
  };

  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    cleanupTestState();
  });

  describe('byName', () => {
    test('finds session by name', async () => {
      const { addSession } = await import('@/core/config/state.js');
      const session: SessionState = {
        name: 'test-session',
        pid: 1234,
        path: '/test',
        dir: '/home/user/test',
        started_at: '2024-01-01T00:00:00Z'
      };
      addSession(session);

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byName('test-session')).toEqual(session);
    });

    test('returns undefined for non-existent session', () => {
      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byName('non-existent')).toBeUndefined();
    });
  });

  describe('byDir', () => {
    test('finds session by directory', async () => {
      const { addSession } = await import('@/core/config/state.js');
      const session: SessionState = {
        name: 'test-session',
        pid: 1234,
        path: '/test',
        dir: '/home/user/test',
        started_at: '2024-01-01T00:00:00Z'
      };
      addSession(session);

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byDir('/home/user/test')).toEqual(session);
    });

    test('returns undefined for non-existent directory', () => {
      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byDir('/non/existent')).toBeUndefined();
    });
  });

  describe('byPath', () => {
    test('finds session by URL path', async () => {
      const { addSession } = await import('@/core/config/state.js');
      const session: SessionState = {
        name: 'test-session',
        pid: 1234,
        path: '/test',
        dir: '/home/user/test',
        started_at: '2024-01-01T00:00:00Z'
      };
      addSession(session);

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byPath('/bunterm/test/ws')).toEqual(session);
    });

    test('finds session for exact path match', async () => {
      const { addSession } = await import('@/core/config/state.js');
      const session: SessionState = {
        name: 'test-session',
        pid: 1234,
        path: '/test',
        dir: '/home/user/test',
        started_at: '2024-01-01T00:00:00Z'
      };
      addSession(session);

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byPath('/bunterm/test')).toEqual(session);
    });

    test('returns null for non-matching path', () => {
      const resolver = createSessionResolver(baseConfig);
      expect(resolver.byPath('/bunterm/non-existent')).toBeNull();
    });
  });

  describe('definitionByName', () => {
    test('finds session definition from config', () => {
      const resolver = createSessionResolver(baseConfig);
      const definition = resolver.definitionByName('config-session');
      expect(definition).toBeDefined();
      expect(definition?.dir).toBe('/home/user/config');
    });

    test('returns undefined for non-existent definition', () => {
      const resolver = createSessionResolver(baseConfig);
      expect(resolver.definitionByName('non-existent')).toBeUndefined();
    });
  });

  describe('exists', () => {
    test('returns true for existing session', async () => {
      const { addSession } = await import('@/core/config/state.js');
      addSession({
        name: 'test',
        pid: 1234,
        path: '/test',
        dir: '/test',
        started_at: '2024-01-01T00:00:00Z'
      });

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.exists('test')).toBe(true);
    });

    test('returns false for non-existent session', () => {
      const resolver = createSessionResolver(baseConfig);
      expect(resolver.exists('non-existent')).toBe(false);
    });
  });

  describe('all', () => {
    test('returns all sessions', async () => {
      const { addSession } = await import('@/core/config/state.js');
      addSession({
        name: 'session1',
        pid: 1234,
        path: '/s1',
        dir: '/s1',
        started_at: '2024-01-01T00:00:00Z'
      });
      addSession({
        name: 'session2',
        pid: 5678,
        path: '/s2',
        dir: '/s2',
        started_at: '2024-01-01T00:00:00Z'
      });

      const resolver = createSessionResolver(baseConfig);
      expect(resolver.all()).toHaveLength(2);
    });
  });
});
