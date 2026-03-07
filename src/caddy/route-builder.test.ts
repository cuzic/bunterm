import { describe, expect, test } from 'bun:test';
import {
  createPortalRoute,
  createProxyRoute,
  createSessionRoute,
  filterOutSessionRoutes,
  findServerForHost,
  findTtydMuxRoutes,
  getSessionRoutes,
  routeExists,
  sessionRouteExists
} from './route-builder.js';
import type { CaddyServer } from './types.js';

describe('route-builder', () => {
  describe('createProxyRoute', () => {
    test('creates a reverse proxy route', () => {
      const route = createProxyRoute('example.com', '/bunterm', 'localhost:7680');

      expect(route.match).toEqual([{ host: ['example.com'], path: ['/bunterm/*'] }]);
      expect(route.handle).toEqual([
        { handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7680' }] }
      ]);
    });
  });

  describe('createSessionRoute', () => {
    test('creates a session route', () => {
      const route = createSessionRoute('example.com', '/bunterm/my-session', 7601);

      expect(route.match).toEqual([{ host: ['example.com'], path: ['/bunterm/my-session/*'] }]);
      expect(route.handle).toEqual([
        { handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7601' }] }
      ]);
    });
  });

  describe('createPortalRoute', () => {
    test('creates a portal route', () => {
      const route = createPortalRoute('example.com', '/bunterm', 7680);

      expect(route.match).toEqual([
        {
          host: ['example.com'],
          path: ['/bunterm', '/bunterm/', '/bunterm/api/*']
        }
      ]);
      expect(route.handle).toEqual([
        { handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7680' }] }
      ]);
    });
  });

  describe('findServerForHost', () => {
    test('finds server by hostname', () => {
      const servers = {
        srv1: {
          routes: [{ match: [{ host: ['other.com'], path: ['/*'] }] }]
        },
        srv2: {
          routes: [{ match: [{ host: ['example.com'], path: ['/bunterm/*'] }] }]
        }
      };

      const result = findServerForHost(servers, 'example.com');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('srv2');
    });

    test('returns null when no server matches', () => {
      const servers = {
        srv1: {
          routes: [{ match: [{ host: ['other.com'], path: ['/*'] }] }]
        }
      };

      const result = findServerForHost(servers, 'example.com');

      expect(result).toBeNull();
    });

    test('returns null for empty servers', () => {
      const result = findServerForHost({}, 'example.com');

      expect(result).toBeNull();
    });
  });

  describe('routeExists', () => {
    test('returns true when route exists', () => {
      const server: CaddyServer = {
        routes: [{ match: [{ host: ['example.com'], path: ['/bunterm/*'] }] }]
      };

      expect(routeExists(server, 'example.com', '/bunterm')).toBe(true);
    });

    test('returns false when route does not exist', () => {
      const server: CaddyServer = {
        routes: [{ match: [{ host: ['example.com'], path: ['/other/*'] }] }]
      };

      expect(routeExists(server, 'example.com', '/bunterm')).toBe(false);
    });

    test('returns false for empty routes', () => {
      const server: CaddyServer = { routes: [] };

      expect(routeExists(server, 'example.com', '/bunterm')).toBe(false);
    });
  });

  describe('sessionRouteExists', () => {
    test('returns true when session route exists', () => {
      const server: CaddyServer = {
        routes: [{ match: [{ host: ['example.com'], path: ['/bunterm/my-session/*'] }] }]
      };

      expect(sessionRouteExists(server, 'example.com', '/bunterm/my-session')).toBe(true);
    });

    test('returns false when session route does not exist', () => {
      const server: CaddyServer = {
        routes: [{ match: [{ host: ['example.com'], path: ['/bunterm/*'] }] }]
      };

      expect(sessionRouteExists(server, 'example.com', '/bunterm/my-session')).toBe(false);
    });
  });

  describe('getSessionRoutes', () => {
    test('extracts session routes from server', () => {
      const server: CaddyServer = {
        routes: [
          {
            match: [{ host: ['example.com'], path: ['/bunterm/session1/*'] }],
            handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7601' }] }]
          },
          {
            match: [{ host: ['example.com'], path: ['/bunterm/session2/*'] }],
            handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7602' }] }]
          },
          {
            match: [{ host: ['example.com'], path: ['/bunterm', '/bunterm/'] }],
            handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7680' }] }]
          }
        ]
      };

      const result = getSessionRoutes(server, 'example.com', '/bunterm');

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ path: '/bunterm/session1', port: 7601 });
      expect(result).toContainEqual({ path: '/bunterm/session2', port: 7602 });
    });

    test('returns empty array for server without session routes', () => {
      const server: CaddyServer = {
        routes: [
          {
            match: [{ host: ['example.com'], path: ['/bunterm'] }],
            handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7680' }] }]
          }
        ]
      };

      const result = getSessionRoutes(server, 'example.com', '/bunterm');

      expect(result).toHaveLength(0);
    });
  });

  describe('filterOutSessionRoutes', () => {
    test('filters out stale session routes', () => {
      const routes = [
        {
          match: [{ host: ['example.com'], path: ['/bunterm/keep/*'] }],
          handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7601' }] }]
        },
        {
          match: [{ host: ['example.com'], path: ['/bunterm/remove/*'] }],
          handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7602' }] }]
        },
        {
          match: [{ host: ['example.com'], path: ['/other/*'] }],
          handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:8080' }] }]
        }
      ];

      const keepPaths = new Set(['/bunterm/keep']);
      const result = filterOutSessionRoutes(routes, 'example.com', '/bunterm', keepPaths);

      expect(result).toHaveLength(2);
      expect(result.some((r) => r.match?.[0]?.path?.includes('/bunterm/keep/*'))).toBe(true);
      expect(result.some((r) => r.match?.[0]?.path?.includes('/other/*'))).toBe(true);
      expect(result.some((r) => r.match?.[0]?.path?.includes('/bunterm/remove/*'))).toBe(false);
    });
  });

  describe('findTtydMuxRoutes', () => {
    test('finds bunterm routes across all servers', () => {
      const servers = {
        srv1: {
          routes: [
            {
              match: [{ host: ['example.com'], path: ['/bunterm/*'] }],
              handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:7680' }] }]
            }
          ]
        },
        srv2: {
          routes: [
            {
              match: [{ host: ['other.com'], path: ['/api/*'] }],
              handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:8080' }] }]
            }
          ]
        }
      };

      const result = findTtydMuxRoutes(servers, '/bunterm');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        serverName: 'srv1',
        hosts: ['example.com'],
        paths: ['/bunterm/*'],
        upstream: 'localhost:7680'
      });
    });

    test('returns empty array when no bunterm routes exist', () => {
      const servers = {
        srv1: {
          routes: [
            {
              match: [{ host: ['example.com'], path: ['/api/*'] }],
              handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:8080' }] }]
            }
          ]
        }
      };

      const result = findTtydMuxRoutes(servers, '/bunterm');

      expect(result).toHaveLength(0);
    });
  });
});
