import type { IncomingMessage, ServerResponse } from 'node:http';
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
import { staticFiles, resetAllStaticCaches, generateEtag } from './static-file-server.js';
import { generateTabsHtml } from './tabs/index.js';

// Cache for sw.js (Service Worker) - special case, generated not from file
let swJsCache: string | null = null;
let swJsEtag: string | null = null;

// Regex for stripping trailing slashes
const TRAILING_SLASH_REGEX = /\/$/;

/**
 * Reset sw.js (Service Worker) cache (for testing)
 */
export function resetSwCache(): void {
  swJsCache = null;
  swJsEtag = null;
}

/**
 * Reset all static file caches (for testing)
 */
export function resetAllCaches(): void {
  resetSwCache();
  resetAllStaticCaches();
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
  // Note: https: is allowed for general API calls (e.g., Caddy forward_auth, AI services)
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https:${sentryConnectSrc}; frame-src 'self'`
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
    staticFiles.terminalUi.serve(req, res);
    return;
  }

  // Tabs JavaScript (static file)
  if (url === `${basePath}/tabs.js`) {
    staticFiles.tabs.serve(req, res);
    return;
  }

  // Native terminal static files
  if (url === `${basePath}/xterm-bundle.js`) {
    staticFiles.xtermBundle.serve(req, res);
    return;
  }
  if (url === `${basePath}/terminal-client.js`) {
    staticFiles.terminalClient.serve(req, res);
    return;
  }
  if (url === `${basePath}/xterm.css`) {
    staticFiles.xtermCss.serve(req, res);
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
