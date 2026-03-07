import type { Config, SessionState } from '@/core/config/types.js';

export interface CaddyfileOptions {
  hostname: string;
  portalDir: string;
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
