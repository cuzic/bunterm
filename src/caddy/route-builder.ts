import type { CaddyMatch, CaddyRoute, CaddyServer } from './types.js';

/** Regex to extract port from upstream URL */
const PORT_REGEX = /:(\d+)$/;

/**
 * Create a reverse proxy route
 */
export function createProxyRoute(hostname: string, basePath: string, upstream: string): CaddyRoute {
  return {
    match: [
      {
        host: [hostname],
        path: [`${basePath}/*`]
      }
    ],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: upstream }]
      }
    ]
  };
}

/**
 * Create a route for a specific session (static mode)
 */
export function createSessionRoute(
  hostname: string,
  sessionPath: string,
  port: number
): CaddyRoute {
  return {
    match: [
      {
        host: [hostname],
        path: [`${sessionPath}/*`]
      }
    ],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${port}` }]
      }
    ]
  };
}

/**
 * Create portal route (exact match for base path without trailing content)
 */
export function createPortalRoute(
  hostname: string,
  basePath: string,
  daemonPort: number
): CaddyRoute {
  return {
    match: [
      {
        host: [hostname],
        path: [`${basePath}`, `${basePath}/`, `${basePath}/api/*`]
      }
    ],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${daemonPort}` }]
      }
    ]
  };
}

/**
 * Find server that handles a specific hostname
 */
export function findServerForHost(
  servers: Record<string, CaddyServer>,
  hostname: string
): { name: string; server: CaddyServer } | null {
  for (const [name, server] of Object.entries(servers)) {
    for (const route of server.routes ?? []) {
      for (const match of route.match ?? []) {
        if (match.host?.includes(hostname)) {
          return { name, server };
        }
      }
    }
  }
  return null;
}

/**
 * Check if a route exists for hostname and path
 */
export function routeExists(server: CaddyServer, hostname: string, basePath: string): boolean {
  return (server.routes ?? []).some((route) =>
    (route.match ?? []).some(
      (m) => m.host?.includes(hostname) && m.path?.some((p) => p.startsWith(basePath))
    )
  );
}

/**
 * Check if a session route exists
 */
export function sessionRouteExists(
  server: CaddyServer,
  hostname: string,
  sessionPath: string
): boolean {
  return (server.routes ?? []).some((route) =>
    (route.match ?? []).some(
      (m) => m.host?.includes(hostname) && m.path?.some((p) => p === `${sessionPath}/*`)
    )
  );
}

/**
 * Extract upstream from route handlers
 */
function extractUpstream(route: CaddyRoute): string {
  const proxyHandler = (route.handle ?? []).find((h) => h.handler === 'reverse_proxy');
  return proxyHandler?.upstreams?.[0]?.dial ?? 'unknown';
}

/**
 * Check if a path matches session route pattern
 */
function isSessionPath(path: string, basePath: string): boolean {
  return path.startsWith(`${basePath}/`) && path.endsWith('/*');
}

/**
 * Extract session info from a matching path and route
 */
function extractSessionInfo(
  path: string,
  route: CaddyRoute
): { path: string; port: number } | null {
  const sessionPath = path.slice(0, -2); // Remove /*
  const upstream = extractUpstream(route);
  const portMatch = upstream.match(PORT_REGEX);
  if (!portMatch?.[1]) {
    return null;
  }
  return { path: sessionPath, port: Number.parseInt(portMatch[1], 10) };
}

/**
 * Extract session routes from a single route match
 */
function extractSessionRoutesFromMatch(
  match: CaddyMatch,
  route: CaddyRoute,
  hostname: string,
  basePath: string
): Array<{ path: string; port: number }> {
  if (!match.host?.includes(hostname)) {
    return [];
  }

  return (match.path ?? [])
    .filter((p) => isSessionPath(p, basePath))
    .map((path) => extractSessionInfo(path, route))
    .filter((info): info is { path: string; port: number } => info !== null);
}

/**
 * Get all bunterm session routes from a server
 */
export function getSessionRoutes(
  server: CaddyServer,
  hostname: string,
  basePath: string
): Array<{ path: string; port: number }> {
  return (server.routes ?? []).flatMap((route) =>
    (route.match ?? []).flatMap((match) =>
      extractSessionRoutesFromMatch(match, route, hostname, basePath)
    )
  );
}

/**
 * Check if a route should be removed (is a stale session route)
 */
function isStaleSessionRoute(
  route: CaddyRoute,
  hostname: string,
  basePath: string,
  keepPaths: Set<string>
): boolean {
  for (const match of route.match ?? []) {
    if (!match.host?.includes(hostname)) {
      continue;
    }

    for (const path of match.path ?? []) {
      if (!isSessionPath(path, basePath)) {
        continue;
      }
      const sessionPath = path.slice(0, -2);
      if (!keepPaths.has(sessionPath)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Remove session routes that are no longer active
 */
export function filterOutSessionRoutes(
  routes: CaddyRoute[],
  hostname: string,
  basePath: string,
  keepPaths: Set<string>
): CaddyRoute[] {
  return routes.filter((route) => !isStaleSessionRoute(route, hostname, basePath, keepPaths));
}

/**
 * Find bunterm routes in all servers
 */
export function findTtydMuxRoutes(
  servers: Record<string, CaddyServer>,
  basePath: string
): Array<{
  serverName: string;
  hosts: string[];
  paths: string[];
  upstream: string;
}> {
  const results: Array<{
    serverName: string;
    hosts: string[];
    paths: string[];
    upstream: string;
  }> = [];

  for (const [serverName, server] of Object.entries(servers)) {
    for (const route of server.routes ?? []) {
      for (const match of route.match ?? []) {
        const paths = match.path ?? [];
        if (paths.some((p) => p.startsWith(basePath))) {
          const hosts = match.host ?? ['*'];
          const upstream = extractUpstream(route);
          results.push({ serverName, hosts, paths, upstream });
        }
      }
    }
  }

  return results;
}
