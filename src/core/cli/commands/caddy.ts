import {
  type CaddyClient,
  type CaddyRoute,
  type CaddyServer,
  connectToCaddy
} from '@/caddy/client.js';
import {
  createProxyRoute,
  findServerForHost,
  findTtydMuxRoutes,
  routeExists
} from '@/caddy/route-builder.js';
import { loadConfig } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';
import { handleCliError, requireHostname } from '@/utils/errors.js';

export interface CaddyOptions {
  hostname?: string;
  adminApi?: string;
  config?: string;
}

function getHostname(options: CaddyOptions, config: Config): string | undefined {
  return options.hostname ?? config.hostname;
}

function getAdminApi(options: CaddyOptions, config: Config): string {
  return options.adminApi ?? config.caddy_admin_api;
}

// Generate snippet for Caddyfile users
export function caddySnippetCommand(options: CaddyOptions): void {
  const config = loadConfig(options.config);
  const _basePath = config.base_path;
  const _daemonPort = config.daemon_port;
}

// Setup route via Admin API
export async function caddySetupCommand(options: CaddyOptions): Promise<void> {
  const config = loadConfig(options.config);
  const adminApi = getAdminApi(options, config);
  const hostname = getHostname(options, config);
  requireHostname(hostname);

  const basePath = config.base_path;
  const daemonPort = config.daemon_port;

  const client = await connectToCaddyOrExit(adminApi);

  try {
    const servers = await client.getServers();
    const serverInfo = findServerForHost(servers, hostname);

    const buntermRoute = createProxyRoute(hostname, basePath, `localhost:${daemonPort}`);

    if (serverInfo) {
      if (routeExists(serverInfo.server, hostname, basePath)) {
        return;
      }

      const existingRoutes = serverInfo.server.routes ?? [];
      await client.updateServerRoutes(serverInfo.name, [buntermRoute, ...existingRoutes]);
    } else {
      await createNewServer(client, hostname, [buntermRoute]);
    }
  } catch (error) {
    handleCliError('Error', error);
    process.exit(1);
  }
}

async function createNewServer(
  client: CaddyClient,
  hostname: string,
  routes: CaddyRoute[]
): Promise<void> {
  const newServer: CaddyServer = {
    listen: [':443'],
    routes: [
      ...routes,
      {
        // Fallback route
        handle: [
          {
            handler: 'static_response',
            body: 'OK'
          }
        ]
      }
    ]
  };

  const serverName = `srv_${hostname.replace(/\./g, '_')}`;
  await client.createServer(serverName, newServer);
}

// Remove route via Admin API
export async function caddyRemoveCommand(options: CaddyOptions): Promise<void> {
  const config = loadConfig(options.config);
  const adminApi = getAdminApi(options, config);
  const hostname = getHostname(options, config);
  requireHostname(hostname);

  const basePath = config.base_path;
  const client = await connectToCaddyOrExit(adminApi);

  try {
    const servers = await client.getServers();
    let removed = false;

    // Find and remove all bunterm routes
    for (const [serverName, server] of Object.entries(servers)) {
      const routes = server.routes ?? [];
      const filteredRoutes = routes.filter((route) => {
        const matches = route.match ?? [];
        return !matches.some(
          (m) => m.host?.includes(hostname) && m.path?.some((p) => p.startsWith(basePath))
        );
      });

      if (filteredRoutes.length < routes.length) {
        await client.updateServerRoutes(serverName, filteredRoutes);
        removed = true;
      }
    }

    if (removed) {
    } else {
    }
  } catch (error) {
    handleCliError('Error', error);
    process.exit(1);
  }
}

// Sync command is no longer needed (native terminal uses proxy mode)
export function caddySyncCommand(_options: CaddyOptions): void {}

async function connectToCaddyOrExit(adminApi: string): Promise<CaddyClient> {
  try {
    return await connectToCaddy(adminApi);
  } catch {
    process.exit(1);
  }
}

// Show current Caddy status
export async function caddyStatusCommand(options: CaddyOptions): Promise<void> {
  const config = loadConfig(options.config);
  const adminApi = getAdminApi(options, config);
  const basePath = config.base_path;
  const client = await connectToCaddyOrExit(adminApi);

  const servers = await client.getServers();

  if (Object.keys(servers).length === 0) {
    return;
  }

  const routes = findTtydMuxRoutes(servers, basePath);

  if (routes.length === 0) {
    return;
  }

  for (const _route of routes) {
  }
}
