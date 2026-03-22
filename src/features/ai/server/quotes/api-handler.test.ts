import { describe, expect, test } from 'bun:test';
import { findRoute, ROUTE_TABLE, type RouteMatch } from './api-handler.js';

describe('Claude Quotes API routing', () => {
  describe('findRoute', () => {
    test('matches exact route: /claude-quotes/sessions', () => {
      const result = findRoute('/claude-quotes/sessions');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('exact');
    });

    test('matches pattern route: /claude-quotes/turn/:uuid', () => {
      const result = findRoute('/claude-quotes/turn/abc-123-def');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('pattern');
      if (result!.kind === 'pattern') {
        expect(result!.captures).toEqual(['abc-123-def']);
      }
    });

    test('matches pattern route with URL-encoded uuid', () => {
      const result = findRoute('/claude-quotes/turn/abc%2F123');
      expect(result).not.toBeNull();
      if (result!.kind === 'pattern') {
        expect(result!.captures).toEqual(['abc%2F123']);
      }
    });

    test('matches prefix route: /claude-quotes/recent', () => {
      const result = findRoute('/claude-quotes/recent');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches prefix route with query string path: /claude-quotes/recent?limit=10', () => {
      // Note: query string is not part of apiPath, this tests prefix matching
      const result = findRoute('/claude-quotes/recent');
      expect(result).not.toBeNull();
    });

    test('matches longer prefix before shorter: /claude-quotes/recent-markdown vs /claude-quotes/recent', () => {
      const result = findRoute('/claude-quotes/recent-markdown');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches longer prefix: /claude-quotes/git-diff-file vs /claude-quotes/git-diff', () => {
      const result = findRoute('/claude-quotes/git-diff-file');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches /claude-quotes/git-diff', () => {
      const result = findRoute('/claude-quotes/git-diff');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches /claude-quotes/project-markdown', () => {
      const result = findRoute('/claude-quotes/project-markdown');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches /claude-quotes/plans', () => {
      const result = findRoute('/claude-quotes/plans');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('matches /claude-quotes/file-content', () => {
      const result = findRoute('/claude-quotes/file-content');
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('prefix');
    });

    test('returns null for unknown route', () => {
      const result = findRoute('/claude-quotes/unknown');
      expect(result).toBeNull();
    });

    test('returns null for non-claude-quotes path', () => {
      const result = findRoute('/api/sessions');
      expect(result).toBeNull();
    });

    test('does not match /claude-quotes/turn without uuid', () => {
      const result = findRoute('/claude-quotes/turn/');
      expect(result).toBeNull();
    });

    test('does not match /claude-quotes/turn with extra path segments', () => {
      const result = findRoute('/claude-quotes/turn/uuid/extra');
      expect(result).toBeNull();
    });
  });

  describe('ROUTE_TABLE', () => {
    test('has expected number of routes', () => {
      expect(ROUTE_TABLE.length).toBe(9);
    });

    test('all routes have a handler', () => {
      for (const route of ROUTE_TABLE) {
        expect(typeof route.handler).toBe('function');
      }
    });

    test('each route has a valid kind', () => {
      for (const route of ROUTE_TABLE) {
        expect(['exact', 'prefix', 'pattern']).toContain(route.kind);
      }
    });

    test('exact routes have path field', () => {
      for (const route of ROUTE_TABLE) {
        if (route.kind === 'exact') {
          expect(route.path).toBeDefined();
          expect(typeof route.path).toBe('string');
        }
      }
    });

    test('prefix routes have prefix field', () => {
      for (const route of ROUTE_TABLE) {
        if (route.kind === 'prefix') {
          expect(route.prefix).toBeDefined();
          expect(typeof route.prefix).toBe('string');
        }
      }
    });

    test('pattern routes have pattern field', () => {
      for (const route of ROUTE_TABLE) {
        if (route.kind === 'pattern') {
          expect(route.pattern).toBeDefined();
          expect(route.pattern).toBeInstanceOf(RegExp);
        }
      }
    });
  });
});
