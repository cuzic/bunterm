/**
 * Native Terminal HTTP Request Handler
 *
 * Handles HTTP requests for native terminal mode, including:
 * - Portal page
 * - Session HTML pages
 * - Static files (xterm-bundle.js, terminal-client.js, etc.)
 * - API endpoints
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from '@/config/types.js';
import { createLogger } from '@/utils/logger.js';
import { generatePortalHtml } from '@/daemon/portal.js';
import { getIconPng, getIconSvg, getManifestJson, getServiceWorker } from '@/daemon/pwa.js';
import { generateNativeTerminalHtml } from './html-template.js';
import type { NativeSessionManager } from './session-manager.js';
import { isNativeTerminalHtmlPath } from './ws-handler.js';

const log = createLogger('native-http');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Static file caches
interface CacheEntry {
  content: string;
  etag: string;
}

const fileCache = new Map<string, CacheEntry>();

/**
 * Generate ETag from content
 */
function generateEtag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Load and cache a static file
 */
function loadStaticFile(filename: string, fallbackMessage: string): CacheEntry {
  const cached = fileCache.get(filename);
  if (cached) {
    return cached;
  }

  let content: string;
  try {
    const distPath = join(__dirname, '../../../dist', filename);
    content = readFileSync(distPath, 'utf-8');
    log.debug(`Loaded ${filename} from dist`);
  } catch {
    log.warn(`${filename} not found in dist`);
    content = `// ${fallbackMessage}\nconsole.warn("[${filename}] Not found");`;
  }

  const entry = { content, etag: generateEtag(content) };
  fileCache.set(filename, entry);
  return entry;
}

/**
 * Serve a static file with ETag caching
 */
function serveStaticFile(
  req: Request,
  filename: string,
  contentType: string,
  fallbackMessage: string
): Response {
  const { content, etag } = loadStaticFile(filename, fallbackMessage);

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' },
    });
  }

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

/**
 * Set security headers on response
 */
function securityHeaders(sentryEnabled = false): Record<string, string> {
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:${sentryConnectSrc}; frame-src 'self'`,
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  };
}

/**
 * Handle HTTP request for native terminal mode
 */
export async function handleHttpRequest(
  req: Request,
  config: Config,
  sessionManager: NativeSessionManager,
  basePath: string
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;
  const sentryEnabled = config.sentry?.enabled ?? false;
  const headers = securityHeaders(sentryEnabled);

  // API routes - delegate to existing API handler
  if (pathname.startsWith(`${basePath}/api/`)) {
    return handleApiRequest(req, config, sessionManager, basePath);
  }

  // PWA routes
  if (pathname === `${basePath}/manifest.json`) {
    const json = getManifestJson(basePath);
    return new Response(json, {
      headers: { ...headers, 'Content-Type': 'application/manifest+json' },
    });
  }

  if (pathname === `${basePath}/sw.js`) {
    const sw = getServiceWorker();
    const etag = generateEtag(sw);
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' },
      });
    }
    return new Response(sw, {
      headers: {
        ...headers,
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        ETag: etag,
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  }

  if (pathname === `${basePath}/icon.svg`) {
    return new Response(getIconSvg(), {
      headers: { ...headers, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  if (pathname === `${basePath}/icon-192.png`) {
    const png = getIconPng(192);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  if (pathname === `${basePath}/icon-512.png`) {
    const png = getIconPng(512);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // Static JavaScript/CSS files
  if (pathname === `${basePath}/terminal-ui.js`) {
    return serveStaticFile(req, 'terminal-ui.js', 'application/javascript', 'Run: bun run build:terminal-ui');
  }

  if (pathname === `${basePath}/tabs.js`) {
    return serveStaticFile(req, 'tabs.js', 'application/javascript', 'Run: bun run build:tabs');
  }

  if (pathname === `${basePath}/xterm-bundle.js`) {
    return serveStaticFile(req, 'xterm-bundle.js', 'application/javascript', 'Run: bun run build:xterm');
  }

  if (pathname === `${basePath}/terminal-client.js`) {
    return serveStaticFile(req, 'terminal-client.js', 'application/javascript', 'Run: bun run build:terminal-client');
  }

  if (pathname === `${basePath}/xterm.css`) {
    return serveStaticFile(req, 'xterm.css', 'text/css', 'xterm.css not found');
  }

  // Portal page
  if (pathname === basePath || pathname === `${basePath}/`) {
    if (method === 'GET') {
      const sessions = sessionManager.listSessions().map((s) => ({
        name: s.name,
        pid: s.pid,
        port: 0, // Native sessions don't use ports
        path: `/${s.name}`,
        dir: s.dir,
        started_at: s.startedAt,
      }));
      const html = generatePortalHtml(config, sessions);
      return new Response(html, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // Session HTML page (native terminal)
  if (isNativeTerminalHtmlPath(pathname, basePath)) {
    const sessionName = extractSessionName(pathname, basePath);
    if (sessionName) {
      // Check if session exists
      let session = sessionManager.getSession(sessionName);

      // If session doesn't exist, try to create it
      if (!session) {
        try {
          session = await sessionManager.createSession({
            name: sessionName,
            dir: process.cwd(), // Default to current directory
            path: `${basePath}/${sessionName}`,
          });
          log.info(`Created session on demand: ${sessionName}`);
        } catch (error) {
          log.error(`Failed to create session ${sessionName}: ${error}`);
          return new Response('Failed to create session', {
            status: 500,
            headers: { ...headers, 'Content-Type': 'text/plain' },
          });
        }
      }

      const html = generateNativeTerminalHtml({
        sessionName,
        basePath,
        sessionPath: `${basePath}/${sessionName}`,
        config,
      });
      return new Response(html, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // Not found
  return new Response('Not Found', {
    status: 404,
    headers: { ...headers, 'Content-Type': 'text/plain' },
  });
}

/**
 * Extract session name from path
 */
function extractSessionName(pathname: string, basePath: string): string | null {
  const prefix = basePath + '/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  let rest = pathname.slice(prefix.length);
  if (rest.endsWith('/')) {
    rest = rest.slice(0, -1);
  }

  // Should be just the session name
  if (rest.includes('/')) {
    return null;
  }

  return rest || null;
}

/**
 * Handle API requests for native terminal mode
 */
async function handleApiRequest(
  req: Request,
  config: Config,
  sessionManager: NativeSessionManager,
  basePath: string
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;
  const apiPath = pathname.slice(`${basePath}/api`.length);

  const headers = {
    'Content-Type': 'application/json',
    ...securityHeaders(config.sentry?.enabled ?? false),
  };

  // GET /api/status
  if (apiPath === '/status' && method === 'GET') {
    const sessions = sessionManager.listSessions().map((s) => ({
      name: s.name,
      pid: s.pid,
      port: 0,
      path: `/${s.name}`,
      dir: s.dir,
      started_at: s.startedAt,
      clients: s.clientCount,
    }));

    return new Response(
      JSON.stringify({
        daemon: {
          pid: process.pid,
          port: config.daemon_port,
          backend: 'native',
        },
        sessions,
      }),
      { headers }
    );
  }

  // GET /api/sessions
  if (apiPath === '/sessions' && method === 'GET') {
    const sessions = sessionManager.listSessions().map((s) => ({
      name: s.name,
      pid: s.pid,
      port: 0,
      path: `/${s.name}`,
      dir: s.dir,
      started_at: s.startedAt,
    }));
    return new Response(JSON.stringify(sessions), { headers });
  }

  // POST /api/sessions - Create new session
  if (apiPath === '/sessions' && method === 'POST') {
    try {
      const body = await req.json();
      const { name, dir } = body as { name?: string; dir?: string };

      if (!name) {
        return new Response(JSON.stringify({ error: 'Session name is required' }), {
          status: 400,
          headers,
        });
      }

      if (sessionManager.hasSession(name)) {
        return new Response(JSON.stringify({ error: `Session ${name} already exists` }), {
          status: 409,
          headers,
        });
      }

      const session = await sessionManager.createSession({
        name,
        dir: dir || process.cwd(),
        path: `${basePath}/${name}`,
      });

      return new Response(
        JSON.stringify({
          name: session.name,
          pid: session.pid,
          path: `/${name}`,
          dir: session.cwd,
        }),
        { status: 201, headers }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 400,
        headers,
      });
    }
  }

  // DELETE /api/sessions/:name
  if (apiPath.startsWith('/sessions/') && method === 'DELETE') {
    const sessionName = apiPath.slice('/sessions/'.length);

    if (!sessionManager.hasSession(sessionName)) {
      return new Response(JSON.stringify({ error: `Session ${sessionName} not found` }), {
        status: 404,
        headers,
      });
    }

    try {
      await sessionManager.stopSession(sessionName);
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers,
      });
    }
  }

  // Not found
  return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
    status: 404,
    headers,
  });
}
