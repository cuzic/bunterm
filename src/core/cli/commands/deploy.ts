import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getSessions, isDaemonRunning } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { getAllSessions } from '@/core/config/state.js';
import type { SessionState } from '@/core/config/types.js';
import { generateCaddyJson, generateCaddyfileSnippet } from '@/deploy/caddyfile.js';
import { generateDeployScript } from '@/deploy/deploy-script.js';
import { generateStaticPortalHtml } from '@/deploy/static-portal.js';
import { requireHostname } from '@/utils/errors.js';

export interface DeployOptions {
  hostname?: string;
  output?: string;
  config?: string;
}

function getDefaultDeployDir(): string {
  return join(homedir(), '.local', 'share', 'bunterm', 'deploy');
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  const config = loadConfig(options.config);
  const hostname = options.hostname ?? config.hostname;
  requireHostname(hostname);

  const deployDir = options.output ?? getDefaultDeployDir();
  const portalDir = join(deployDir, 'portal');

  // Get sessions
  let sessions: SessionState[];
  if (await isDaemonRunning()) {
    const sessionResponses = await getSessions(config);
    sessions = sessionResponses.map((s) => ({
      name: s.name,
      pid: s.pid,
      port: s.port,
      path: s.path,
      dir: s.dir,
      started_at: s.started_at
    }));
  } else {
    // Fallback to state file
    sessions = getAllSessions();
  }

  // Create directories
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
  }
  if (!existsSync(portalDir)) {
    mkdirSync(portalDir, { recursive: true });
  }

  // Generate static portal HTML
  const portalHtml = generateStaticPortalHtml(config, sessions);
  const portalPath = join(portalDir, 'index.html');
  writeFileSync(portalPath, portalHtml);

  // Generate Caddyfile snippet
  const caddyfileSnippet = generateCaddyfileSnippet(config, sessions, {
    hostname,
    portalDir
  });
  const caddyfilePath = join(deployDir, 'Caddyfile.snippet');
  writeFileSync(caddyfilePath, caddyfileSnippet);

  // Generate Caddy JSON routes
  const caddyJson = generateCaddyJson(config, sessions, {
    hostname,
    portalDir
  });
  const caddyJsonPath = join(deployDir, 'caddy-routes.json');
  writeFileSync(caddyJsonPath, JSON.stringify(caddyJson, null, 2));

  // Generate deploy script
  const deployScript = generateDeployScript(config, {
    hostname,
    deployDir,
    caddyAdminApi: config.caddy_admin_api
  });
  const scriptPath = join(deployDir, 'deploy.sh');
  writeFileSync(scriptPath, deployScript, { mode: 0o755 });

  if (sessions.length > 0) {
    for (const _session of sessions) {
    }
  } else {
  }
}
