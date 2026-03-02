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
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addShare, getAllShares, getShare, getStateDir, removeShare } from '@/config/state.js';
import type { Config } from '@/config/types.js';
import { getPublicVapidKey } from '@/daemon/notification/vapid.js';
import { generatePortalHtml } from '@/daemon/portal.js';
import { getIconPng, getIconSvg, getManifestJson, getServiceWorker } from '@/daemon/pwa.js';
import { createShareManager } from '@/daemon/share-manager.js';
import { createLogger } from '@/utils/logger.js';
import { createBlockSSEStream } from './block-event-emitter.js';
import {
  type CommandExecutorManager,
  createCommandExecutorManager
} from './command-executor-manager.js';
import { generateNativeTerminalHtml } from './html-template.js';
import type { NativeSessionManager } from './session-manager.js';
import type { CommandRequest } from './types.js';
import { isNativeTerminalHtmlPath } from './ws-handler.js';

const log = createLogger('native-http');

// Command executor manager (lazy initialized)
let executorManager: CommandExecutorManager | null = null;

/**
 * Get or create the command executor manager
 */
function getExecutorManager(sessionManager: NativeSessionManager): CommandExecutorManager {
  if (!executorManager) {
    executorManager = createCommandExecutorManager(sessionManager);
  }
  return executorManager;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create ShareManager with file-system backed store
const shareManager = createShareManager({
  getShares: getAllShares,
  addShare: addShare,
  removeShare: removeShare,
  getShare: (token: string) => getShare(token)
});

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
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' }
    });
  }

  return new Response(content, {
    headers: {
      'Content-Type': contentType,
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
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
    // Allow Google OAuth for Caddy forward_auth, and https: for general API calls
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https:${sentryConnectSrc}; frame-src 'self'`,
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()'
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
      headers: { ...headers, 'Content-Type': 'application/manifest+json' }
    });
  }

  if (pathname === `${basePath}/sw.js`) {
    const sw = getServiceWorker();
    const etag = generateEtag(sw);
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' }
      });
    }
    return new Response(sw, {
      headers: {
        ...headers,
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        ETag: etag,
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }

  if (pathname === `${basePath}/icon.svg`) {
    return new Response(getIconSvg(), {
      headers: {
        ...headers,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  }

  if (pathname === `${basePath}/icon-192.png`) {
    const png = getIconPng(192);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }
    });
  }

  if (pathname === `${basePath}/icon-512.png`) {
    const png = getIconPng(512);
    return new Response(new Uint8Array(png), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }
    });
  }

  // Static JavaScript/CSS files
  if (pathname === `${basePath}/terminal-ui.js`) {
    return serveStaticFile(
      req,
      'terminal-ui.js',
      'application/javascript',
      'Run: bun run build:terminal-ui'
    );
  }

  if (pathname === `${basePath}/tabs.js`) {
    return serveStaticFile(req, 'tabs.js', 'application/javascript', 'Run: bun run build:tabs');
  }

  if (pathname === `${basePath}/xterm-bundle.js`) {
    return serveStaticFile(
      req,
      'xterm-bundle.js',
      'application/javascript',
      'Run: bun run build:xterm'
    );
  }

  if (pathname === `${basePath}/terminal-client.js`) {
    return serveStaticFile(
      req,
      'terminal-client.js',
      'application/javascript',
      'Run: bun run build:terminal-client'
    );
  }

  if (pathname === `${basePath}/xterm.css`) {
    return serveStaticFile(req, 'xterm.css', 'text/css', 'xterm.css not found');
  }

  if (pathname === `${basePath}/ai-chat.js`) {
    return serveStaticFile(
      req,
      'ai-chat.js',
      'application/javascript',
      'Run: bun run build:ai-chat'
    );
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
        started_at: s.startedAt
      }));
      const html = generatePortalHtml(config, sessions);
      return new Response(html, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' }
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
            path: `${basePath}/${sessionName}`
          });
          log.info(`Created session on demand: ${sessionName}`);
        } catch (error) {
          log.error(`Failed to create session ${sessionName}: ${error}`);
          return new Response('Failed to create session', {
            status: 500,
            headers: { ...headers, 'Content-Type': 'text/plain' }
          });
        }
      }

      const html = generateNativeTerminalHtml({
        sessionName,
        basePath,
        sessionPath: `${basePath}/${sessionName}`,
        config
      });
      return new Response(html, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  }

  // Share page: /share/:token
  const shareMatch = pathname.match(new RegExp(`^${basePath}/share/([^/]+)$`));
  if (shareMatch?.[1]) {
    const token = decodeURIComponent(shareMatch[1]);
    const share = shareManager.validateShare(token);

    if (!share) {
      return new Response('Share link not found or expired', {
        status: 404,
        headers: { ...headers, 'Content-Type': 'text/plain' }
      });
    }

    const sessionName = share.sessionName;

    // Check if session exists
    if (!sessionManager.hasSession(sessionName)) {
      return new Response('Session not found', {
        status: 404,
        headers: { ...headers, 'Content-Type': 'text/plain' }
      });
    }

    const html = generateNativeTerminalHtml({
      sessionName,
      basePath,
      sessionPath: `${basePath}/${sessionName}`,
      config,
      isShared: true
    });
    return new Response(html, {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Not found
  return new Response('Not Found', {
    status: 404,
    headers: { ...headers, 'Content-Type': 'text/plain' }
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
    ...securityHeaders(config.sentry?.enabled ?? false)
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
      clients: s.clientCount
    }));

    return new Response(
      JSON.stringify({
        daemon: {
          pid: process.pid,
          port: config.daemon_port,
          backend: 'native'
        },
        sessions
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
      started_at: s.startedAt
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
          headers
        });
      }

      if (sessionManager.hasSession(name)) {
        return new Response(JSON.stringify({ error: `Session ${name} already exists` }), {
          status: 409,
          headers
        });
      }

      const session = await sessionManager.createSession({
        name,
        dir: dir || process.cwd(),
        path: `${basePath}/${name}`
      });

      return new Response(
        JSON.stringify({
          name: session.name,
          pid: session.pid,
          path: `/${name}`,
          dir: session.cwd
        }),
        { status: 201, headers }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 400,
        headers
      });
    }
  }

  // DELETE /api/sessions/:name
  if (
    apiPath.startsWith('/sessions/') &&
    method === 'DELETE' &&
    !apiPath.includes('/commands') &&
    !apiPath.includes('/blocks') &&
    !apiPath.includes('/integration')
  ) {
    const sessionName = apiPath.slice('/sessions/'.length);

    if (!sessionManager.hasSession(sessionName)) {
      return new Response(JSON.stringify({ error: `Session ${sessionName} not found` }), {
        status: 404,
        headers
      });
    }

    try {
      await sessionManager.stopSession(sessionName);
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // === Command Block API ===

  // POST /api/sessions/:name/commands - Execute a command
  const commandsMatch = apiPath.match(/^\/sessions\/([^/]+)\/commands$/);
  if (commandsMatch?.[1] && method === 'POST') {
    const sessionName = decodeURIComponent(commandsMatch[1]);

    if (!sessionManager.hasSession(sessionName)) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const body = (await req.json()) as CommandRequest;

      if (!body.command || typeof body.command !== 'string') {
        return new Response(JSON.stringify({ error: 'command is required' }), {
          status: 400,
          headers
        });
      }

      const executor = getExecutorManager(sessionManager);
      const response = await executor.executeCommand(sessionName, body);

      return new Response(JSON.stringify(response), {
        status: 202, // Accepted
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // GET /api/sessions/:name/blocks - List blocks for a session
  const sessionBlocksMatch = apiPath.match(/^\/sessions\/([^/]+)\/blocks$/);
  if (sessionBlocksMatch?.[1] && method === 'GET') {
    const sessionName = decodeURIComponent(sessionBlocksMatch[1]);

    if (!sessionManager.hasSession(sessionName)) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    const executor = getExecutorManager(sessionManager);
    const blocks = executor.getSessionBlocks(sessionName);

    return new Response(JSON.stringify(blocks), { headers });
  }

  // GET /api/sessions/:name/integration - Get OSC 633 integration status
  const integrationMatch = apiPath.match(/^\/sessions\/([^/]+)\/integration$/);
  if (integrationMatch?.[1] && method === 'GET') {
    const sessionName = decodeURIComponent(integrationMatch[1]);

    if (!sessionManager.hasSession(sessionName)) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    const executor = getExecutorManager(sessionManager);
    const status = executor.getIntegrationStatus(sessionName);

    if (!status) {
      return new Response(
        JSON.stringify({
          osc633: false,
          status: 'unknown',
          testedAt: null,
          message: 'Integration not tested. Use persistent mode to test.'
        }),
        { headers }
      );
    }

    return new Response(JSON.stringify(status), { headers });
  }

  // GET /api/blocks/:blockId - Get a specific block
  const blockMatch = apiPath.match(/^\/blocks\/([^/]+)$/);
  if (blockMatch?.[1] && method === 'GET') {
    const blockId = decodeURIComponent(blockMatch[1]);

    const executor = getExecutorManager(sessionManager);
    const block = executor.getBlock(blockId);

    if (!block) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers
      });
    }

    return new Response(JSON.stringify(block), { headers });
  }

  // POST /api/blocks/:blockId/cancel - Cancel a running command
  const cancelMatch = apiPath.match(/^\/blocks\/([^/]+)\/cancel$/);
  if (cancelMatch?.[1] && method === 'POST') {
    const blockId = decodeURIComponent(cancelMatch[1]);

    const executor = getExecutorManager(sessionManager);
    const block = executor.getBlock(blockId);

    if (!block) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const body = (await req.json().catch(() => ({}))) as {
        signal?: 'SIGTERM' | 'SIGINT' | 'SIGKILL';
      };
      const signal = body.signal ?? 'SIGTERM';

      // Find which session this block belongs to
      // For now, iterate through all sessions
      let response = null;
      for (const session of sessionManager.listSessions()) {
        const result = executor.cancelCommand(session.name, blockId, signal);
        if (result.success) {
          response = result;
          break;
        }
      }

      if (!response) {
        return new Response(
          JSON.stringify({ error: 'Block is not running or cannot be canceled' }),
          { status: 400, headers }
        );
      }

      return new Response(JSON.stringify(response), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // POST /api/blocks/:blockId/pin - Pin a block
  const pinMatch = apiPath.match(/^\/blocks\/([^/]+)\/pin$/);
  if (pinMatch?.[1] && method === 'POST') {
    const blockId = decodeURIComponent(pinMatch[1]);

    const executor = getExecutorManager(sessionManager);
    const success = executor.pinBlock(blockId);

    if (!success) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers
      });
    }

    return new Response(JSON.stringify({ success: true, blockId }), { headers });
  }

  // DELETE /api/blocks/:blockId/pin - Unpin a block
  if (pinMatch?.[1] && method === 'DELETE') {
    const blockId = decodeURIComponent(pinMatch[1]);

    const executor = getExecutorManager(sessionManager);
    const success = executor.unpinBlock(blockId);

    if (!success) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers
      });
    }

    return new Response(JSON.stringify({ success: true, blockId }), { headers });
  }

  // GET /api/blocks/:blockId/chunks - Get output chunks
  const chunksMatch = apiPath.match(/^\/blocks\/([^/]+)\/chunks$/);
  if (chunksMatch?.[1] && method === 'GET') {
    const blockId = decodeURIComponent(chunksMatch[1]);
    const params = new URL(req.url).searchParams;

    const executor = getExecutorManager(sessionManager);
    const block = executor.getBlock(blockId);

    if (!block) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers
      });
    }

    const fromSeq = params.get('fromSeq') ? Number.parseInt(params.get('fromSeq')!, 10) : undefined;
    const stream = params.get('stream') as 'stdout' | 'stderr' | 'all' | null;
    const limit = params.get('limit') ? Number.parseInt(params.get('limit')!, 10) : undefined;

    const result = executor.getBlockChunks(blockId, {
      fromSeq,
      stream: stream ?? 'all',
      limit
    });

    return new Response(JSON.stringify(result), { headers });
  }

  // GET /api/blocks/:blockId/stream - SSE stream for block events
  const streamMatch = apiPath.match(/^\/blocks\/([^/]+)\/stream$/);
  if (streamMatch?.[1] && method === 'GET') {
    const blockId = decodeURIComponent(streamMatch[1]);

    const executor = getExecutorManager(sessionManager);
    const block = executor.getBlock(blockId);

    if (!block) {
      return new Response(JSON.stringify({ error: `Block "${blockId}" not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get Last-Event-ID header for resumption
    const lastEventId = req.headers.get('Last-Event-ID');
    const fromSeq = lastEventId ? Number.parseInt(lastEventId, 10) : undefined;

    const eventEmitter = executor.getEventEmitter();
    const stream = createBlockSSEStream(eventEmitter, blockId, { lastEventId: fromSeq });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      }
    });
  }

  // === Notification API ===

  // GET /api/notifications/vapid-key
  if (apiPath === '/notifications/vapid-key' && method === 'GET') {
    try {
      const publicKey = getPublicVapidKey(getStateDir());
      return new Response(JSON.stringify({ publicKey }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // GET /api/notifications/subscriptions
  if (apiPath === '/notifications/subscriptions' && method === 'GET') {
    return new Response(JSON.stringify([]), { headers });
  }

  // === Share API ===

  // GET /api/shares - List all shares
  if (apiPath === '/shares' && method === 'GET') {
    const shares = shareManager.listShares();
    return new Response(JSON.stringify(shares), { headers });
  }

  // POST /api/shares - Create a share
  if (apiPath === '/shares' && method === 'POST') {
    try {
      const body = (await req.json()) as { sessionName: string; expiresIn?: string };

      // Check if session exists
      if (!sessionManager.hasSession(body.sessionName)) {
        return new Response(JSON.stringify({ error: `Session "${body.sessionName}" not found` }), {
          status: 404,
          headers
        });
      }

      const share = shareManager.createShare(body.sessionName, {
        expiresIn: body.expiresIn ?? '1h'
      });
      return new Response(JSON.stringify(share), { status: 201, headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 400,
        headers
      });
    }
  }

  // GET /api/shares/:token - Validate a share
  if (apiPath.startsWith('/shares/') && method === 'GET') {
    const token = decodeURIComponent(apiPath.slice('/shares/'.length));
    const share = shareManager.validateShare(token);
    if (share) {
      return new Response(JSON.stringify(share), { headers });
    }
    return new Response(JSON.stringify({ error: 'Share not found or expired' }), {
      status: 404,
      headers
    });
  }

  // DELETE /api/shares/:token - Revoke a share
  if (apiPath.startsWith('/shares/') && method === 'DELETE') {
    const token = decodeURIComponent(apiPath.slice('/shares/'.length));
    const success = shareManager.revokeShare(token);
    if (success) {
      return new Response(JSON.stringify({ success: true }), { headers });
    }
    return new Response(JSON.stringify({ error: 'Share not found' }), {
      status: 404,
      headers
    });
  }

  // === File API ===

  // GET /api/files/list?session=<name>&path=<path>
  if (apiPath.startsWith('/files/list') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path') || '.';

    if (!sessionName) {
      return new Response(JSON.stringify({ error: 'session parameter is required' }), {
        status: 400,
        headers
      });
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const baseDir = session.cwd;
      const targetPath = resolve(baseDir, filePath);

      // Security: ensure path is within base directory
      if (!targetPath.startsWith(baseDir)) {
        return new Response(JSON.stringify({ error: 'Invalid path' }), {
          status: 400,
          headers
        });
      }

      if (!existsSync(targetPath)) {
        return new Response(JSON.stringify({ error: 'Path not found' }), {
          status: 404,
          headers
        });
      }

      const stat = statSync(targetPath);
      if (!stat.isDirectory()) {
        return new Response(JSON.stringify({ error: 'Path is not a directory' }), {
          status: 400,
          headers
        });
      }

      const entries = readdirSync(targetPath, { withFileTypes: true });
      const files = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entry.isFile() ? statSync(join(targetPath, entry.name)).size : 0
      }));

      return new Response(JSON.stringify({ path: filePath, files }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // GET /api/files/download?session=<name>&path=<path>
  if (apiPath.startsWith('/files/download') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      return new Response(JSON.stringify({ error: 'session and path parameters are required' }), {
        status: 400,
        headers
      });
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const baseDir = session.cwd;
      const targetPath = resolve(baseDir, filePath);

      // Security: ensure path is within base directory
      if (!targetPath.startsWith(baseDir)) {
        return new Response(JSON.stringify({ error: 'Invalid path' }), {
          status: 400,
          headers
        });
      }

      if (!existsSync(targetPath)) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers
        });
      }

      const content = readFileSync(targetPath);
      const filename = filePath.split('/').pop() || 'download';

      return new Response(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // POST /api/files/upload?session=<name>&path=<path>
  if (apiPath.startsWith('/files/upload') && method === 'POST') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      return new Response(JSON.stringify({ error: 'session and path parameters are required' }), {
        status: 400,
        headers
      });
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const baseDir = session.cwd;
      const targetPath = resolve(baseDir, filePath);

      // Security: ensure path is within base directory
      if (!targetPath.startsWith(baseDir)) {
        return new Response(JSON.stringify({ error: 'Invalid path' }), {
          status: 400,
          headers
        });
      }

      const content = await req.arrayBuffer();
      writeFileSync(targetPath, Buffer.from(content));

      return new Response(JSON.stringify({ success: true, path: filePath }), {
        status: 201,
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // === Preview API ===

  // GET /api/preview/file?session=<name>&path=<path>
  if (apiPath.startsWith('/preview/file') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!sessionName || !filePath) {
      return new Response(JSON.stringify({ error: 'session and path parameters are required' }), {
        status: 400,
        headers
      });
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const baseDir = session.cwd;
      const targetPath = resolve(baseDir, filePath);

      // Security: ensure path is within base directory
      if (!targetPath.startsWith(baseDir)) {
        return new Response(JSON.stringify({ error: 'Invalid path' }), {
          status: 400,
          headers
        });
      }

      if (!existsSync(targetPath)) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers
        });
      }

      const content = readFileSync(targetPath, 'utf-8');
      return new Response(content, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // === Context Files API ===

  // GET /api/context-files/recent - List recent .md files from plans and project
  if (apiPath.startsWith('/context-files/recent') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const sessionName = params.get('session');
    const count = Math.min(Number.parseInt(params.get('count') ?? '10', 10), 20);

    if (!sessionName) {
      return new Response(JSON.stringify({ error: 'session parameter is required' }), {
        status: 400,
        headers
      });
    }

    const session = sessionManager.getSession(sessionName);
    if (!session) {
      return new Response(JSON.stringify({ error: `Session "${sessionName}" not found` }), {
        status: 404,
        headers
      });
    }

    try {
      const files: Array<{
        source: 'plans' | 'project';
        path: string;
        name: string;
        size: number;
        modifiedAt: string;
      }> = [];

      // 1. Get plans files from ~/.claude/plans/
      const plansDir = join(homedir(), '.claude', 'plans');
      if (existsSync(plansDir)) {
        const planFiles = collectMdFiles(plansDir, plansDir);
        for (const file of planFiles) {
          files.push({
            source: 'plans',
            path: file.path,
            name: file.name,
            size: file.size,
            modifiedAt: file.modifiedAt
          });
        }
      }

      // 2. Get project files from session working directory
      const projectDir = session.cwd;
      if (existsSync(projectDir)) {
        const projectFiles = collectMdFiles(projectDir, projectDir, {
          excludeDirs: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']
        });
        for (const file of projectFiles) {
          files.push({
            source: 'project',
            path: file.path,
            name: file.name,
            size: file.size,
            modifiedAt: file.modifiedAt
          });
        }
      }

      // Sort by modifiedAt descending
      files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      // Limit to count
      const limitedFiles = files.slice(0, count);

      return new Response(JSON.stringify({ files: limitedFiles }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // GET /api/context-files/content - Get file content
  if (apiPath.startsWith('/context-files/content') && method === 'GET') {
    const params = new URL(req.url).searchParams;
    const source = params.get('source') as 'plans' | 'project' | null;
    const sessionName = params.get('session');
    const filePath = params.get('path');

    if (!source || !filePath) {
      return new Response(JSON.stringify({ error: 'source and path parameters are required' }), {
        status: 400,
        headers
      });
    }

    if (source !== 'plans' && source !== 'project') {
      return new Response(JSON.stringify({ error: 'source must be "plans" or "project"' }), {
        status: 400,
        headers
      });
    }

    // For project files, session is required
    if (source === 'project' && !sessionName) {
      return new Response(JSON.stringify({ error: 'session parameter is required for project files' }), {
        status: 400,
        headers
      });
    }

    try {
      let baseDir: string;
      if (source === 'plans') {
        baseDir = join(homedir(), '.claude', 'plans');
      } else {
        // sessionName is guaranteed to be non-null here (checked above for project source)
        const sessionId = sessionName as string;
        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ error: `Session "${sessionId}" not found` }), {
            status: 404,
            headers
          });
        }
        baseDir = session.cwd;
      }

      const targetPath = resolve(baseDir, filePath);

      // Security: ensure path is within base directory
      if (!targetPath.startsWith(baseDir)) {
        return new Response(JSON.stringify({ error: 'Invalid path' }), {
          status: 400,
          headers
        });
      }

      if (!existsSync(targetPath)) {
        return new Response(JSON.stringify({ error: 'File not found' }), {
          status: 404,
          headers
        });
      }

      const stat = statSync(targetPath);

      // Check file size limit (100KB)
      const MAX_FILE_SIZE = 100 * 1024;
      if (stat.size > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ error: `File too large (max ${MAX_FILE_SIZE / 1024}KB)` }),
          {
            status: 413,
            headers
          }
        );
      }

      const content = readFileSync(targetPath, 'utf-8');
      const name = basename(targetPath);

      return new Response(
        JSON.stringify({
          source,
          path: filePath,
          name,
          content,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        }),
        { headers }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // === AI API ===

  // GET /api/ai/runners - List available AI runners
  if (apiPath === '/ai/runners' && method === 'GET') {
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    const runners = await aiService.getRunnerStatuses();
    return new Response(JSON.stringify({ runners }), { headers });
  }

  // POST /api/ai/runs - Execute an AI chat request
  if (apiPath === '/ai/runs' && method === 'POST') {
    try {
      const body = (await req.json()) as {
        question: string;
        context: {
          sessionId: string;
          blocks: string[];
          inlineBlocks?: Array<{
            id: string;
            type: 'command' | 'claude';
            content: string;
            metadata?: Record<string, unknown>;
          }>;
          files?: Array<{ source: 'plans' | 'project'; path: string }>;
          renderMode?: 'full' | 'errorOnly' | 'preview' | 'commandOnly';
        };
        runner?: 'claude' | 'codex' | 'gemini' | 'auto';
        conversationId?: string;
      };

      if (!body.question || typeof body.question !== 'string') {
        return new Response(JSON.stringify({ error: 'question is required' }), {
          status: 400,
          headers
        });
      }

      if (!body.context?.sessionId || !Array.isArray(body.context?.blocks)) {
        return new Response(
          JSON.stringify({ error: 'context with sessionId and blocks is required' }),
          {
            status: 400,
            headers
          }
        );
      }

      const aiModule = await import('./ai/index.js');
      const aiService = aiModule.getAIService();

      // Get block data from executor manager
      const executor = getExecutorManager(sessionManager);
      const blockContexts: import('./ai/types.js').BlockContext[] = [];

      for (const blockId of body.context.blocks) {
        const block = executor.getBlock(blockId);
        if (block) {
          // Map ExtendedBlockStatus to simpler BlockContext status
          let status: 'running' | 'success' | 'error';
          switch (block.status) {
            case 'queued':
            case 'running':
              status = 'running';
              break;
            case 'success':
              status = 'success';
              break;
            case 'error':
            case 'timeout':
            case 'canceled':
              status = 'error';
              break;
            default:
              status = 'error';
          }

          // Combine stdout and stderr previews for output
          const output = [block.stdoutPreview, block.stderrPreview].filter(Boolean).join('\n');

          blockContexts.push({
            id: block.id,
            command: block.command,
            output,
            exitCode: block.exitCode,
            status,
            cwd: block.effectiveCwd,
            startedAt: block.startedAt,
            endedAt: block.endedAt
          });
        }
      }

      // Load file contexts if specified
      const fileContexts: import('./ai/types.js').FileContext[] = [];
      if (body.context.files && Array.isArray(body.context.files)) {
        const session = sessionManager.getSession(body.context.sessionId);
        const sessionCwd = session?.cwd ?? process.cwd();

        for (const fileRef of body.context.files) {
          try {
            let baseDir: string;
            if (fileRef.source === 'plans') {
              baseDir = join(homedir(), '.claude', 'plans');
            } else {
              baseDir = sessionCwd;
            }

            const targetPath = resolve(baseDir, fileRef.path);

            // Security: ensure path is within base directory
            if (!targetPath.startsWith(baseDir)) {
              continue;
            }

            if (!existsSync(targetPath)) {
              continue;
            }

            const stat = statSync(targetPath);

            // Skip files larger than 100KB
            if (stat.size > 100 * 1024) {
              continue;
            }

            const content = readFileSync(targetPath, 'utf-8');
            const name = basename(targetPath);

            fileContexts.push({
              source: fileRef.source,
              path: fileRef.path,
              name,
              content,
              size: stat.size,
              modifiedAt: stat.mtime.toISOString()
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      const response = await aiService.chat(
        {
          question: body.question,
          context: {
            sessionId: body.context.sessionId,
            blocks: body.context.blocks,
            inlineBlocks: body.context.inlineBlocks,
            files: body.context.files,
            renderMode: body.context.renderMode ?? 'full'
          },
          runner: body.runner,
          conversationId: body.conversationId
        },
        blockContexts,
        fileContexts,
        undefined, // userId
        body.context.inlineBlocks // Pass inline blocks directly
      );

      return new Response(JSON.stringify(response), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // GET /api/ai/runs/:runId - Get a specific AI run
  const runMatch = apiPath.match(/^\/ai\/runs\/([^/]+)$/);
  if (runMatch?.[1] && method === 'GET') {
    const runId = decodeURIComponent(runMatch[1]);
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    const run = aiService.getRun(runId);

    if (!run) {
      return new Response(JSON.stringify({ error: `Run "${runId}" not found` }), {
        status: 404,
        headers
      });
    }

    return new Response(JSON.stringify(run), { headers });
  }

  // GET /api/ai/threads/:threadId - Get a conversation thread
  const threadMatch = apiPath.match(/^\/ai\/threads\/([^/]+)$/);
  if (threadMatch?.[1] && method === 'GET') {
    const threadId = decodeURIComponent(threadMatch[1]);
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    const thread = aiService.getThread(threadId);

    if (!thread) {
      return new Response(JSON.stringify({ error: `Thread "${threadId}" not found` }), {
        status: 404,
        headers
      });
    }

    return new Response(JSON.stringify(thread), { headers });
  }

  // GET /api/ai/sessions/:sessionId/threads - Get threads for a session
  const sessionThreadsMatch = apiPath.match(/^\/ai\/sessions\/([^/]+)\/threads$/);
  if (sessionThreadsMatch?.[1] && method === 'GET') {
    const sessionId = decodeURIComponent(sessionThreadsMatch[1]);
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    const threads = aiService.getSessionThreads(sessionId);
    return new Response(JSON.stringify(threads), { headers });
  }

  // DELETE /api/ai/sessions/:sessionId/history - Clear session history
  const clearHistoryMatch = apiPath.match(/^\/ai\/sessions\/([^/]+)\/history$/);
  if (clearHistoryMatch?.[1] && method === 'DELETE') {
    const sessionId = decodeURIComponent(clearHistoryMatch[1]);
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    aiService.clearSessionHistory(sessionId);
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // GET /api/ai/stats - Get AI service statistics
  if (apiPath === '/ai/stats' && method === 'GET') {
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    const stats = aiService.getStats();
    return new Response(JSON.stringify(stats), { headers });
  }

  // DELETE /api/ai/cache - Clear AI cache
  if (apiPath === '/ai/cache' && method === 'DELETE') {
    const { getAIService } = await import('./ai/index.js');
    const aiService = getAIService();
    aiService.clearCache();
    return new Response(JSON.stringify({ success: true }), { headers });
  }

  // === Auth API ===

  // POST /api/auth/ws-token - Generate a WebSocket token
  if (apiPath === '/auth/ws-token' && method === 'POST') {
    try {
      const body = (await req.json()) as { sessionId: string; userId?: string };

      if (!body.sessionId || typeof body.sessionId !== 'string') {
        return new Response(JSON.stringify({ error: 'sessionId is required' }), {
          status: 400,
          headers
        });
      }

      // Verify session exists
      if (!sessionManager.hasSession(body.sessionId)) {
        return new Response(JSON.stringify({ error: `Session "${body.sessionId}" not found` }), {
          status: 404,
          headers
        });
      }

      const { getTokenGenerator } = await import('./ws/session-token.js');
      const tokenGenerator = getTokenGenerator();
      const token = tokenGenerator.generate(body.sessionId, body.userId);

      return new Response(
        JSON.stringify({
          token,
          sessionId: body.sessionId,
          expiresIn: 30 // seconds
        }),
        { headers }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers
      });
    }
  }

  // Not found
  return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
    status: 404,
    headers
  });
}

/**
 * Collect .md files from a directory recursively
 */
interface CollectOptions {
  excludeDirs?: string[];
  maxDepth?: number;
}

interface CollectedFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

function collectMdFiles(
  dir: string,
  baseDir: string,
  options: CollectOptions = {},
  currentDepth = 0
): CollectedFile[] {
  const { excludeDirs = [], maxDepth = 5 } = options;
  const files: CollectedFile[] = [];

  if (currentDepth > maxDepth) {
    return files;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) {
          continue;
        }
        // Skip hidden directories
        if (entry.name.startsWith('.')) {
          continue;
        }
        // Recurse into subdirectory
        const subFiles = collectMdFiles(entryPath, baseDir, options, currentDepth + 1);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const stat = statSync(entryPath);
          files.push({
            path: relative(baseDir, entryPath),
            name: entry.name,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          });
        } catch {
          // Skip files that can't be stat'd
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return files;
}
