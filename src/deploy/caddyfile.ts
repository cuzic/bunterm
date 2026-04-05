import type { Config, SessionState } from '@/core/config/types.js';

export interface CaddyfileOptions {
  hostname: string;
  portalDir: string;
}

export interface WsConfig {
  /** Set to true when caddy-security's authorize directive is in use.
   *  Adds an @untrusted named matcher with `not header Upgrade websocket`
   *  so WebSocket upgrade requests bypass the authorize gate. */
  useCaddySecurity: boolean;
}

/**
 * Build the @ws_upgrade named matcher + handle block lines.
 * Always placed before the main session traffic block so Caddy
 * evaluates the WebSocket bypass first.
 */
function buildWsUpgradeBlock(daemonPort: number): string[] {
  return [
    '# WebSocket bypass – must come before any authorize directive',
    '@ws_upgrade {',
    '    header Connection *Upgrade*',
    '    header Upgrade websocket',
    '}',
    'handle @ws_upgrade {',
    `    reverse_proxy 127.0.0.1:${daemonPort}`,
    '}'
  ];
}

/**
 * Build the @untrusted named matcher lines for caddy-security.
 * The `not header Upgrade websocket` condition prevents the authorize
 * directive from rejecting WebSocket Upgrade requests with origin_not_allowed.
 */
function buildUntrustedMatcherBlock(): string[] {
  return [
    '# caddy-security: exclude WebSocket upgrades from the authorize check',
    '@untrusted {',
    '    not header Upgrade websocket',
    '}',
    'authorize with @untrusted'
  ];
}

/**
 * Generate a Caddyfile snippet with WebSocket bypass configuration.
 *
 * When `useCaddySecurity` is true the snippet includes:
 *   - An @untrusted named matcher that skips WebSocket Upgrade requests
 *   - authorize with @untrusted directive
 *
 * In both modes an @ws_upgrade handler block is included so that WebSocket
 * connections are reverse-proxied directly without passing through any
 * authentication middleware.
 */
export function generateCaddyfileSnippetWithWsConfig(
  config: Config,
  _sessions: SessionState[],
  options: CaddyfileOptions,
  wsConfig: WsConfig
): string {
  const { hostname, portalDir } = options;
  const { useCaddySecurity } = wsConfig;
  const basePath = config.base_path;
  const daemonPort = config.daemon_port;

  const lines: string[] = [
    `# bunterm configuration for ${hostname}`,
    `# Generated at ${new Date().toISOString()}`,
    '# Add this inside your site block in Caddyfile',
    ''
  ];

  if (useCaddySecurity) {
    lines.push(...buildUntrustedMatcherBlock());
    lines.push('');
  }

  lines.push(...buildWsUpgradeBlock(daemonPort));
  lines.push('');

  lines.push(
    '# Portal page (static HTML)',
    `handle ${basePath} {`,
    '    rewrite * /index.html',
    `    root * ${portalDir}`,
    '    file_server',
    '}',
    '',
    `handle ${basePath}/ {`,
    '    rewrite * /index.html',
    `    root * ${portalDir}`,
    '    file_server',
    '}',
    '',
    '# All session traffic proxied through daemon',
    `handle ${basePath}/* {`,
    `    reverse_proxy localhost:${daemonPort}`,
    '}'
  );

  return lines.join('\n');
}

export function generateCaddyfileSnippet(
  config: Config,
  _sessions: SessionState[],
  options: CaddyfileOptions
): string {
  const { hostname, portalDir } = options;
  const basePath = config.base_path;
  const daemonPort = config.daemon_port;

  const lines: string[] = [
    `# bunterm configuration for ${hostname}`,
    `# Generated at ${new Date().toISOString()}`,
    '# Add this inside your site block in Caddyfile',
    '',
    '# Portal page (static HTML)',
    `handle ${basePath} {`,
    '    rewrite * /index.html',
    `    root * ${portalDir}`,
    '    file_server',
    '}',
    '',
    `handle ${basePath}/ {`,
    '    rewrite * /index.html',
    `    root * ${portalDir}`,
    '    file_server',
    '}',
    '',
    '# All session traffic proxied through daemon',
    `handle ${basePath}/* {`,
    `    reverse_proxy localhost:${daemonPort}`,
    '}'
  ];

  return lines.join('\n');
}

export function generateCaddyJson(
  config: Config,
  _sessions: SessionState[],
  options: CaddyfileOptions
): object {
  const { hostname, portalDir } = options;
  const basePath = config.base_path;
  const daemonPort = config.daemon_port;

  const routes: object[] = [];

  // Portal routes (static HTML)
  routes.push({
    match: [{ host: [hostname], path: [basePath, `${basePath}/`] }],
    handle: [
      { handler: 'rewrite', uri: '/index.html' },
      { handler: 'file_server', root: portalDir }
    ]
  });

  // All session traffic proxied through daemon
  routes.push({
    match: [{ host: [hostname], path: [`${basePath}/*`] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${daemonPort}` }]
      }
    ]
  });

  return { routes };
}
