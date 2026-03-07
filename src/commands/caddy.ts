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
import { loadConfig } from '@/config/config.js';
import type { Config } from '@/config/types.js';
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
  const basePath = config.base_path;
  const daemonPort = config.daemon_port;

  console.log('# Add this to your Caddyfile inside your site block:');
  console.log('');
  console.log(`handle ${basePath}/* {`);
  console.log(`    reverse_proxy localhost:${daemonPort}`);
  console.log('}');
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
        console.log(`Route for ${hostname}${basePath}/* already exists.`);
        return;
      }

      const existingRoutes = serverInfo.server.routes ?? [];
      await client.updateServerRoutes(serverInfo.name, [buntermRoute, ...existingRoutes]);
      console.log(`Added route: ${hostname}${basePath}/* -> localhost:${daemonPort}`);
    } else {
      await createNewServer(client, hostname, [buntermRoute]);
      console.log(
        `Created server for ${hostname} with route: ${basePath}/* -> localhost:${daemonPort}`
      );
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
      console.log(`Removed all bunterm routes for ${hostname}${basePath}/*`);
    } else {
      console.log(`No bunterm routes found for ${hostname}${basePath}/*`);
    }
  } catch (error) {
    handleCliError('Error', error);
    process.exit(1);
  }
}

// Sync command is no longer needed (native terminal uses proxy mode)
export function caddySyncCommand(_options: CaddyOptions): void {
  console.log('Note: sync command is not needed with native terminal mode.');
  console.log('All sessions are automatically proxied through the daemon.');
}

async function connectToCaddyOrExit(adminApi: string): Promise<CaddyClient> {
  try {
    return await connectToCaddy(adminApi);
  } catch {
    console.error(`Error: Cannot connect to Caddy Admin API at ${adminApi}`);
    console.error('Make sure Caddy is running and admin API is enabled.');
    process.exit(1);
  }
}

// Show current Caddy status
export async function caddyStatusCommand(options: CaddyOptions): Promise<void> {
  const config = loadConfig(options.config);
  const adminApi = getAdminApi(options, config);
  const basePath = config.base_path;
  const client = await connectToCaddyOrExit(adminApi);

  console.log(`Caddy Admin API: ${adminApi}`);
  console.log('');

  const servers = await client.getServers();

  if (Object.keys(servers).length === 0) {
    console.log('No HTTP servers configured.');
    return;
  }

  const routes = findTtydMuxRoutes(servers, basePath);

  if (routes.length === 0) {
    console.log(`No bunterm routes found (looking for ${basePath}/*)`);
    return;
  }

  for (const route of routes) {
    console.log(`bunterm route found in server "${route.serverName}":`);
    console.log(`  Hosts: ${route.hosts.join(', ')}`);
    console.log(`  Path: ${route.paths.join(', ')}`);
    console.log(`  Upstream: ${route.upstream}`);
    console.log('');
  }
}
