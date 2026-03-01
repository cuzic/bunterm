import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBasePath } from '@/config/config.js';
import { addShare, getAllShares, getShare, removeShare } from '@/config/state.js';
import type { Config, SessionState } from '@/config/types.js';
import { createLogger } from '@/utils/logger.js';
import { handleApiRequest } from './api-handler.js';
import { proxyToSession } from './http-proxy.js';
import { generatePortalHtml } from './portal.js';
import { getIconPng, getIconSvg, getManifestJson, getServiceWorker } from './pwa.js';
import { sessionManager } from './session-manager.js';
import { createShareManager } from './share-manager.js';
import { generateTabsHtml } from './tabs/index.js';

// Get the directory of this module for resolving dist path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for terminal-ui.js content and ETag
let terminalUiJsCache: string | null = null;
let terminalUiJsEtag: string | null = null;

// Cache for tabs.js content and ETag
let tabsJsCache: string | null = null;
let tabsJsEtag: string | null = null;

// Cache for sw.js (Service Worker) content and ETag
let swJsCache: string | null = null;
let swJsEtag: string | null = null;

// Cache for xterm-bundle.js (native terminal)
let xtermBundleCache: string | null = null;
let xtermBundleEtag: string | null = null;

// Cache for terminal-client.js (native terminal)
let terminalClientCache: string | null = null;
let terminalClientEtag: string | null = null;

// Cache for xterm.css (native terminal)
let xtermCssCache: string | null = null;
let xtermCssEtag: string | null = null;

// Regex for stripping trailing slashes
const TRAILING_SLASH_REGEX = /\/$/;

/**
 * Generate ETag from content using MD5 hash
 * @param content - Content to hash
 * @returns ETag string with quotes (e.g., '"abc123..."')
 */
export function generateEtag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Reset terminal-ui.js cache (for testing)
 */
export function resetTerminalUiCache(): void {
  terminalUiJsCache = null;
  terminalUiJsEtag = null;
}

/**
 * Reset tabs.js cache (for testing)
 */
export function resetTabsCache(): void {
  tabsJsCache = null;
  tabsJsEtag = null;
}

/**
 * Reset sw.js (Service Worker) cache (for testing)
 */
export function resetSwCache(): void {
  swJsCache = null;
  swJsEtag = null;
}

/**
 * Reset xterm-bundle.js cache (for testing)
 */
export function resetXtermBundleCache(): void {
  xtermBundleCache = null;
  xtermBundleEtag = null;
}

/**
 * Reset terminal-client.js cache (for testing)
 */
export function resetTerminalClientCache(): void {
  terminalClientCache = null;
  terminalClientEtag = null;
}

/**
 * Reset xterm.css cache (for testing)
 */
export function resetXtermCssCache(): void {
  xtermCssCache = null;
  xtermCssEtag = null;
}

// Share manager for validating share tokens
const shareManager = createShareManager({
  getShares: getAllShares,
  addShare: addShare,
  removeShare: removeShare,
  getShare: (token: string) => getShare(token)
});

/** Regex to extract share token from path (limited to 64 chars to prevent DoS) */
const SHARE_PATH_REGEX = /^\/share\/([a-f0-9]{1,64})(\/.*)?$/;

const log = createLogger('router');

/**
 * Set security headers on response
 *
 * @param res - Server response object
 * @param sentryEnabled - Whether Sentry is enabled (affects CSP)
 */
export function setSecurityHeaders(res: ServerResponse, sentryEnabled = false): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy - allow inline scripts for terminal UI functionality
  // If Sentry is enabled, allow Sentry CDN scripts and connections
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:${sentryConnectSrc}; frame-src 'self'`
  );
  // Permissions Policy - disable unused browser features
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
}

/** Localhost addresses for origin validation */
const LOCALHOST_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];

/**
 * Check if a remote address is localhost
 */
function isLocalhostAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  return LOCALHOST_ADDRESSES.some(
    (localhost) => address === localhost || address.endsWith(localhost)
  );
}

/**
 * Validate Origin header for state-changing requests (CSRF protection)
 * Returns true if the request is allowed, false otherwise
 */
export function validateOrigin(req: IncomingMessage, config: Config): boolean {
  const method = req.method ?? 'GET';

  // Only validate state-changing methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const origin = req.headers['origin'];
  const host = req.headers['host'];

  // If no Origin header, check Referer as fallback
  if (!origin) {
    const referer = req.headers['referer'];
    if (!referer) {
      // No origin info - only allow for localhost connections (e.g., curl, Postman)
      // This prevents CSRF attacks while allowing local API tools
      const remoteAddress = req.socket?.remoteAddress;
      if (isLocalhostAddress(remoteAddress)) {
        return true;
      }
      // Deny requests from remote hosts without Origin/Referer
      log.warn(`Blocked request without Origin/Referer from: ${remoteAddress}`);
      return false;
    }
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host === host;
    } catch {
      return false;
    }
  }

  // Validate Origin matches expected hosts
  try {
    const originUrl = new URL(origin);

    // Allow localhost and configured hostname
    const allowedHosts = [host, 'localhost', '127.0.0.1', '::1', config.hostname].filter(Boolean);

    // Check if origin host matches any allowed host (ignoring port)
    const originHost = originUrl.hostname;
    return allowedHosts.some((allowed) => {
      if (!allowed) {
        return false;
      }
      // Extract hostname from host:port format
      const allowedHost = allowed.split(':')[0];
      return originHost === allowedHost;
    });
  } catch {
    return false;
  }
}

/**
 * Find session that matches the given path
 */
export function findSessionForPath(config: Config, path: string): SessionState | null {
  const sessions = sessionManager.listSessions();
  const basePath = normalizeBasePath(config.base_path);

  for (const session of sessions) {
    const sessionFullPath = `${basePath}${session.path}`;
    if (path.startsWith(`${sessionFullPath}/`) || path === sessionFullPath) {
      return session;
    }
  }

  return null;
}

/**
 * Serve portal HTML page
 */
function servePortal(config: Config, res: ServerResponse): void {
  const sessions = sessionManager.listSessions();
  const html = generatePortalHtml(config, sessions);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  });
  res.end(html);
}

/**
 * Serve PWA manifest.json
 */
function servePwaManifest(res: ServerResponse, basePath: string): void {
  const json = getManifestJson(basePath);
  res.writeHead(200, {
    'Content-Type': 'application/manifest+json',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

/**
 * Load and cache Service Worker content with ETag
 */
function loadServiceWorker(): { content: string; etag: string } {
  if (swJsCache !== null && swJsEtag !== null) {
    return { content: swJsCache, etag: swJsEtag };
  }

  swJsCache = getServiceWorker();
  swJsEtag = generateEtag(swJsCache);

  return { content: swJsCache, etag: swJsEtag };
}

/**
 * Serve PWA Service Worker
 * Supports ETag-based conditional requests for cache revalidation
 */
function servePwaServiceWorker(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadServiceWorker();

  // Check If-None-Match header for conditional request
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    // Content hasn't changed, return 304 Not Modified
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Content-Length': Buffer.byteLength(content),
    'Service-Worker-Allowed': '/',
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Serve PWA SVG icon
 */
function servePwaIconSvg(res: ServerResponse): void {
  const svg = getIconSvg();
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml',
    'Content-Length': Buffer.byteLength(svg),
    'Cache-Control': 'public, max-age=86400'
  });
  res.end(svg);
}

/**
 * Serve PWA PNG icon
 */
function servePwaIconPng(res: ServerResponse, size: 192 | 512): void {
  const png = getIconPng(size);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': png.length,
    'Cache-Control': 'public, max-age=86400'
  });
  res.end(png);
}

/**
 * Load terminal-ui.js from dist directory (cached)
 * Returns { content, etag }
 */
function loadTerminalUiJs(): { content: string; etag: string } {
  if (terminalUiJsCache !== null && terminalUiJsEtag !== null) {
    return { content: terminalUiJsCache, etag: terminalUiJsEtag };
  }

  try {
    // Load from dist directory (relative to compiled output)
    const distPath = join(__dirname, '../../dist/terminal-ui.js');
    terminalUiJsCache = readFileSync(distPath, 'utf-8');
    log.debug('Loaded terminal-ui.js from dist');
  } catch {
    // Fallback: bundle not available
    log.warn('terminal-ui.js not found in dist, returning placeholder');
    terminalUiJsCache =
      '// terminal-ui.js not built - run: bun run build:terminal-ui\nconsole.warn("[Terminal UI] Bundle not found");';
  }

  // Calculate ETag from content hash
  terminalUiJsEtag = generateEtag(terminalUiJsCache);

  return { content: terminalUiJsCache, etag: terminalUiJsEtag };
}

/**
 * Serve terminal-ui JavaScript (static file from dist)
 * Supports ETag-based conditional requests for cache revalidation
 */
function serveTerminalUiJs(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadTerminalUiJs();

  // Check If-None-Match header for conditional request
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    // Content hasn't changed, return 304 Not Modified
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Content-Length': Buffer.byteLength(content),
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Load tabs.js from dist directory (cached)
 * Returns { content, etag }
 */
function loadTabsJs(): { content: string; etag: string } {
  if (tabsJsCache !== null && tabsJsEtag !== null) {
    return { content: tabsJsCache, etag: tabsJsEtag };
  }

  try {
    // Load from dist directory (relative to compiled output)
    const distPath = join(__dirname, '../../dist/tabs.js');
    tabsJsCache = readFileSync(distPath, 'utf-8');
    log.debug('Loaded tabs.js from dist');
  } catch {
    // Fallback: bundle not available
    log.warn('tabs.js not found in dist, returning placeholder');
    tabsJsCache =
      '// tabs.js not built - run: bun run build:tabs\nconsole.warn("[Tabs] Bundle not found");';
  }

  // Calculate ETag from content hash
  tabsJsEtag = generateEtag(tabsJsCache);

  return { content: tabsJsCache, etag: tabsJsEtag };
}

/**
 * Serve tabs JavaScript (static file from dist)
 * Supports ETag-based conditional requests for cache revalidation
 */
function serveTabsJs(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadTabsJs();

  // Check If-None-Match header for conditional request
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    // Content hasn't changed, return 304 Not Modified
    res.writeHead(304, {
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Content-Length': Buffer.byteLength(content),
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Serve tabs HTML page
 */
function serveTabs(config: Config, res: ServerResponse, sessionName: string | null): void {
  const sessions = sessionManager.listSessions();
  const html = generateTabsHtml(config, sessions, sessionName);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  });
  res.end(html);
}

// === Native Terminal Static Files ===

/**
 * Load xterm-bundle.js from dist directory (cached)
 */
function loadXtermBundle(): { content: string; etag: string } {
  if (xtermBundleCache !== null && xtermBundleEtag !== null) {
    return { content: xtermBundleCache, etag: xtermBundleEtag };
  }

  try {
    const distPath = join(__dirname, '../../dist/xterm-bundle.js');
    xtermBundleCache = readFileSync(distPath, 'utf-8');
    log.debug('Loaded xterm-bundle.js from dist');
  } catch {
    log.warn('xterm-bundle.js not found in dist, returning placeholder');
    xtermBundleCache = '// xterm-bundle.js not built - run: bun run build:xterm\nconsole.warn("[xterm] Bundle not found");';
  }

  xtermBundleEtag = generateEtag(xtermBundleCache);
  return { content: xtermBundleCache, etag: xtermBundleEtag };
}

/**
 * Load terminal-client.js from dist directory (cached)
 */
function loadTerminalClient(): { content: string; etag: string } {
  if (terminalClientCache !== null && terminalClientEtag !== null) {
    return { content: terminalClientCache, etag: terminalClientEtag };
  }

  try {
    const distPath = join(__dirname, '../../dist/terminal-client.js');
    terminalClientCache = readFileSync(distPath, 'utf-8');
    log.debug('Loaded terminal-client.js from dist');
  } catch {
    log.warn('terminal-client.js not found in dist, returning placeholder');
    terminalClientCache = '// terminal-client.js not built - run: bun run build:terminal-client\nconsole.warn("[TerminalClient] Bundle not found");';
  }

  terminalClientEtag = generateEtag(terminalClientCache);
  return { content: terminalClientCache, etag: terminalClientEtag };
}

/**
 * Load xterm.css from dist directory (cached)
 */
function loadXtermCss(): { content: string; etag: string } {
  if (xtermCssCache !== null && xtermCssEtag !== null) {
    return { content: xtermCssCache, etag: xtermCssEtag };
  }

  try {
    const distPath = join(__dirname, '../../dist/xterm.css');
    xtermCssCache = readFileSync(distPath, 'utf-8');
    log.debug('Loaded xterm.css from dist');
  } catch {
    log.warn('xterm.css not found in dist, returning placeholder');
    xtermCssCache = '/* xterm.css not found - run: bun run build:xterm */';
  }

  xtermCssEtag = generateEtag(xtermCssCache);
  return { content: xtermCssCache, etag: xtermCssEtag };
}

/**
 * Serve xterm-bundle.js with ETag caching
 */
function serveXtermBundle(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadXtermBundle();

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Content-Length': Buffer.byteLength(content),
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Serve terminal-client.js with ETag caching
 */
function serveTerminalClient(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadTerminalClient();

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Content-Length': Buffer.byteLength(content),
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Serve xterm.css with ETag caching
 */
function serveXtermCss(req: IncomingMessage, res: ServerResponse): void {
  const { content, etag } = loadXtermCss();

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/css',
    'Content-Length': Buffer.byteLength(content),
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate'
  });
  res.end(content);
}

/**
 * Handle incoming HTTP request
 */
export function handleRequest(config: Config, req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';
  const basePath = normalizeBasePath(config.base_path);
  const sentryEnabled = config.sentry?.enabled ?? false;

  // Apply security headers to all responses
  setSecurityHeaders(res, sentryEnabled);

  log.debug(`Request: ${method} ${url}`);

  // API routes
  if (url.startsWith(`${basePath}/api/`)) {
    // Validate origin for state-changing requests (CSRF protection)
    if (!validateOrigin(req, config)) {
      log.warn(`Blocked request with invalid origin: ${method} ${url}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid origin' }));
      return;
    }
    handleApiRequest(config, req, res);
    return;
  }

  // PWA routes
  if (url === `${basePath}/manifest.json`) {
    servePwaManifest(res, basePath);
    return;
  }
  if (url === `${basePath}/sw.js`) {
    servePwaServiceWorker(req, res);
    return;
  }
  if (url === `${basePath}/icon.svg`) {
    servePwaIconSvg(res);
    return;
  }
  if (url === `${basePath}/icon-192.png`) {
    servePwaIconPng(res, 192);
    return;
  }
  if (url === `${basePath}/icon-512.png`) {
    servePwaIconPng(res, 512);
    return;
  }

  // Terminal UI JavaScript (static file)
  if (url === `${basePath}/terminal-ui.js`) {
    serveTerminalUiJs(req, res);
    return;
  }

  // Tabs JavaScript (static file)
  if (url === `${basePath}/tabs.js`) {
    serveTabsJs(req, res);
    return;
  }

  // Native terminal static files
  if (url === `${basePath}/xterm-bundle.js`) {
    serveXtermBundle(req, res);
    return;
  }
  if (url === `${basePath}/terminal-client.js`) {
    serveTerminalClient(req, res);
    return;
  }
  if (url === `${basePath}/xterm.css`) {
    serveXtermCss(req, res);
    return;
  }

  // Tabs view: /ttyd-mux/tabs/ or /ttyd-mux/tabs/{session}
  if (url.startsWith(`${basePath}/tabs`)) {
    const tabsPath = `${basePath}/tabs`;
    if (url === tabsPath || url === `${tabsPath}/`) {
      // /tabs/ - show tabs view with first/last session
      if (method === 'GET') {
        log.debug('Serving tabs page');
        serveTabs(config, res, null);
        return;
      }
    } else if (url.startsWith(`${tabsPath}/`)) {
      // /tabs/{session} - show tabs view with specific session
      const sessionPart = url.slice(tabsPath.length + 1).replace(TRAILING_SLASH_REGEX, '');
      const sessionName = decodeURIComponent(sessionPart);
      if (method === 'GET' && sessionName) {
        log.debug(`Serving tabs page for session: ${sessionName}`);
        serveTabs(config, res, sessionName);
        return;
      }
    }
  }

  // Portal page
  if (url === basePath || url === `${basePath}/`) {
    if (method === 'GET') {
      log.debug('Serving portal page');
      servePortal(config, res);
      return;
    }
  }

  // Share links: /ttyd-mux/share/:token
  const sharePath = url.slice(basePath.length);
  const shareMatch = sharePath.match(SHARE_PATH_REGEX);
  if (shareMatch?.[1]) {
    const token = shareMatch[1];
    const share = shareManager.validateShare(token);

    if (!share) {
      log.debug(`Share not found or expired: ${token}`);
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Share Link Expired</title></head>
<body style="font-family: sans-serif; padding: 2rem; text-align: center;">
  <h1>Share Link Expired</h1>
  <p>This share link has expired or been revoked.</p>
</body>
</html>`);
      return;
    }

    // Find the session
    const session = sessionManager.listSessions().find((s) => s.name === share.sessionName);
    if (!session) {
      log.debug(`Session not found for share: ${share.sessionName}`);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Session Not Found</title></head>
<body style="font-family: sans-serif; padding: 2rem; text-align: center;">
  <h1>Session Not Found</h1>
  <p>The shared session is no longer running.</p>
</body>
</html>`);
      return;
    }

    // Rewrite URL from /share/:token to the session's actual path
    // shareMatch[2] contains any trailing path (e.g., /ws for WebSocket)
    const trailingPath = shareMatch[2] ?? '/';
    req.url = `${basePath}${session.path}${trailingPath}`;
    log.debug(`Share link rewritten to: ${req.url}`);

    // Proxy to the session in read-only mode
    // Set a header to indicate read-only mode for WebSocket proxy
    req.headers['x-ttyd-mux-readonly'] = 'true';
    proxyToSession(req, res, session.port, basePath, config.terminal_ui, {
      sentryConfig: config.sentry,
      previewAllowedExtensions: config.preview.allowed_extensions
    });
    return;
  }

  // Try to proxy to a session
  const session = findSessionForPath(config, url);
  if (session) {
    proxyToSession(req, res, session.port, basePath, config.terminal_ui, {
      sentryConfig: config.sentry,
      previewAllowedExtensions: config.preview.allowed_extensions
    });
    return;
  }

  // Not found
  log.debug(`Not found: ${url}`);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
