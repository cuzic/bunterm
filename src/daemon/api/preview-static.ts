/**
 * Static file serving for SPA preview
 *
 * Serves static files from session directories for SPA support.
 * Handles MIME types, path traversal protection, and SPA fallback.
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createLogger } from '@/utils/logger.js';
import { isRelativePathSafe } from '@/utils/path-security.js';
import { sendJsonError } from '../http-utils.js';
import { sessionManager } from '../session-manager.js';
import type { RouteContext, RouteHandler } from './types.js';

const log = createLogger('preview-static');

// =============================================================================
// MIME Type Mapping
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  // HTML
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',

  // JavaScript
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',

  // CSS
  '.css': 'text/css; charset=utf-8',

  // JSON
  '.json': 'application/json; charset=utf-8',

  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',

  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',

  // Audio/Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',

  // Other
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json'
};

/**
 * Get MIME type for a file extension
 */
function getMimeType(ext: string): string {
  return MIME_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}

// =============================================================================
// Route Handler
// =============================================================================

/**
 * Handle static file requests for SPA preview
 *
 * Route: GET /api/preview/static/{sessionName}/{path}
 *
 * Features:
 * - Serves static files from session directory
 * - Path traversal protection
 * - MIME type detection
 * - SPA fallback (returns index.html for non-existent paths)
 */
export const handlePreviewStaticRoutes: RouteHandler = (ctx: RouteContext): boolean => {
  const { config, res, path, method } = ctx;

  // Only handle GET /api/preview/static/*
  const prefix = '/api/preview/static/';
  if (!path.startsWith(prefix) || method !== 'GET') {
    return false;
  }

  // Check if preview is enabled
  if (!config.preview.enabled) {
    sendJsonError(res, 403, 'Preview is disabled');
    return true;
  }

  // Check if static serving is enabled
  if (!config.preview.static_serving.enabled) {
    sendJsonError(res, 403, 'Static serving is disabled');
    return true;
  }

  // Parse path: /api/preview/static/{sessionName}/{filePath}
  const relativePath = path.slice(prefix.length);
  const slashIndex = relativePath.indexOf('/');

  if (slashIndex === -1) {
    // No file path specified, could be request for root
    const sessionName = decodeURIComponent(relativePath);
    return handleStaticFile(ctx, sessionName, 'index.html');
  }

  const sessionName = decodeURIComponent(relativePath.slice(0, slashIndex));
  const filePath = relativePath.slice(slashIndex + 1);

  // Handle URL-encoded paths
  const decodedFilePath = decodeURIComponent(filePath);

  return handleStaticFile(ctx, sessionName, decodedFilePath);
};

/**
 * Handle a static file request
 */
function handleStaticFile(ctx: RouteContext, sessionName: string, filePath: string): boolean {
  const { config, res } = ctx;

  // Find the session
  const session = sessionManager.findByName(sessionName);
  if (!session) {
    sendJsonError(res, 404, `Session "${sessionName}" not found`);
    return true;
  }

  // Validate path safety
  if (!isRelativePathSafe(filePath)) {
    log.warn(`Path traversal attempt blocked: ${filePath}`);
    sendJsonError(res, 403, 'Path traversal not allowed');
    return true;
  }

  // Get allowed extensions
  const allowedExtensions = config.preview.static_serving.allowed_extensions;

  // Build full path
  const normalizedPath = normalize(filePath);
  const fullPath = join(session.dir, normalizedPath);

  // Security: Ensure resolved path is within session directory
  const resolvedPath = resolve(fullPath);
  const resolvedSessionDir = resolve(session.dir);
  if (!resolvedPath.startsWith(`${resolvedSessionDir}/`) && resolvedPath !== resolvedSessionDir) {
    log.warn(`Path escape attempt blocked: ${filePath}`);
    sendJsonError(res, 403, 'Access denied');
    return true;
  }

  // Check if file exists
  if (!existsSync(fullPath)) {
    // SPA fallback: try to serve index.html from the base directory
    if (config.preview.static_serving.spa_fallback) {
      return handleSpaFallback(ctx, session.dir, filePath, allowedExtensions);
    }
    sendJsonError(res, 404, 'File not found');
    return true;
  }

  // Get file stats
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(fullPath);
  } catch {
    sendJsonError(res, 404, 'File not found');
    return true;
  }

  // If it's a directory, try index.html
  if (stat.isDirectory()) {
    const indexPath = join(fullPath, 'index.html');
    if (existsSync(indexPath)) {
      return serveFile(ctx, indexPath, allowedExtensions);
    }
    sendJsonError(res, 404, 'Directory listing not allowed');
    return true;
  }

  // Serve the file
  return serveFile(ctx, fullPath, allowedExtensions);
}

/**
 * Handle SPA fallback - find the nearest index.html
 */
function handleSpaFallback(
  ctx: RouteContext,
  sessionDir: string,
  requestedPath: string,
  allowedExtensions: string[]
): boolean {
  // Extract the base directory from the requested path
  // For example, if requestedPath is "dist/some/route", we want to find "dist/index.html"
  const parts = requestedPath.split('/');

  // Try to find index.html starting from the deepest path
  for (let i = parts.length - 1; i >= 0; i--) {
    const basePath = parts.slice(0, i + 1).join('/');
    const indexPath = join(sessionDir, basePath, 'index.html');

    if (existsSync(indexPath)) {
      log.debug(`SPA fallback: ${requestedPath} -> ${basePath}/index.html`);
      return serveFile(ctx, indexPath, allowedExtensions);
    }
  }

  // Try root index.html
  const rootIndexPath = join(sessionDir, 'index.html');
  if (existsSync(rootIndexPath)) {
    log.debug(`SPA fallback: ${requestedPath} -> index.html`);
    return serveFile(ctx, rootIndexPath, allowedExtensions);
  }

  sendJsonError(ctx.res, 404, 'File not found');
  return true;
}

/** Error collection script to inject into HTML files */
const ERROR_COLLECTION_SCRIPT = `
<style>
/* Ensure scrolling works in iframe */
html, body { overflow: auto !important; }
</style>
<script>
(function() {
  var errors = [];
  window.onerror = function(msg, url, line, col, error) {
    var err = { type: 'error', message: msg, url: url, line: line, col: col, stack: error ? error.stack : null };
    errors.push(err);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'preview-error', error: err }, '*');
    }
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    var err = { type: 'unhandledrejection', message: String(e.reason), stack: e.reason && e.reason.stack };
    errors.push(err);
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'preview-error', error: err }, '*');
    }
  });
  console._origError = console.error;
  console.error = function() {
    console._origError.apply(console, arguments);
    var msg = Array.prototype.slice.call(arguments).map(function(a) { return String(a); }).join(' ');
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'preview-console-error', message: msg }, '*');
    }
  };
})();
</script>
`;

/**
 * Serve a file with proper headers
 */
function serveFile(ctx: RouteContext, filePath: string, allowedExtensions: string[]): boolean {
  const { config, res } = ctx;

  // Check extension
  const ext = extname(filePath).toLowerCase();

  // Allow files without extensions (e.g., LICENSE)
  if (ext && !allowedExtensions.includes(ext)) {
    // Special case: .map files for source maps
    if (ext !== '.map') {
      log.debug(`Extension not allowed: ${ext}`);
      sendJsonError(res, 403, `Extension "${ext}" not allowed`);
      return true;
    }
  }

  // Get file stats
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    sendJsonError(res, 404, 'File not found');
    return true;
  }

  // Check file size
  const maxSize = config.preview.static_serving.max_file_size;
  if (stat.size > maxSize) {
    sendJsonError(res, 413, `File too large (max: ${Math.round(maxSize / 1024 / 1024)}MB)`);
    return true;
  }

  // Determine MIME type
  const mimeType = getMimeType(ext);

  // For HTML files, inject error collection script
  if (ext === '.html' || ext === '.htm') {
    return serveHtmlWithErrorCollection(res, filePath, mimeType);
  }

  // Send file
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });

  const stream = createReadStream(filePath);
  stream.pipe(res);

  stream.on('error', (err) => {
    log.error(`Error reading file ${filePath}: ${err.message}`);
    if (!res.headersSent) {
      sendJsonError(res, 500, 'Failed to read file');
    }
  });

  return true;
}

/**
 * Serve HTML file with error collection script injected
 */
function serveHtmlWithErrorCollection(
  res: ServerResponse,
  filePath: string,
  mimeType: string
): boolean {
  try {
    let html = readFileSync(filePath, 'utf-8');

    // Inject error collection script after <head> tag
    const headMatch = html.match(/<head[^>]*>/i);
    if (headMatch) {
      const insertIndex = headMatch.index! + headMatch[0].length;
      html = html.slice(0, insertIndex) + ERROR_COLLECTION_SCRIPT + html.slice(insertIndex);
    } else {
      // No <head> tag, prepend to the document
      html = ERROR_COLLECTION_SCRIPT + html;
    }

    const buffer = Buffer.from(html, 'utf-8');

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    res.end(buffer);
    return true;
  } catch (err) {
    log.error(`Error reading HTML file ${filePath}: ${(err as Error).message}`);
    sendJsonError(res, 500, 'Failed to read file');
    return true;
  }
}
