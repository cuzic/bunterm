/**
 * HTTP Handler Utilities
 *
 * Common utilities for HTTP request handling.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AnyDomainError, toHttpStatus } from '@/core/errors.js';
import { createLogger } from '@/utils/logger.js';
import { isErr, type Result } from '@/utils/result.js';

const log = createLogger('http-utils');

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
export function generateEtag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Load and cache a static file
 */
export function loadStaticFile(filename: string, fallbackMessage: string): CacheEntry {
  const cached = fileCache.get(filename);
  if (cached) {
    return cached;
  }

  let content: string;
  try {
    // Go up from http/utils.ts to server/, then to dist/
    const distPath = join(__dirname, '../../../../dist', filename);
    // biome-ignore lint: sync read for file caching
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
export function serveStaticFile(
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
export function securityHeaders(sentryEnabled = false): Record<string, string> {
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: https:${sentryConnectSrc}; frame-src 'self'`,
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()'
  };
}

/**
 * Create JSON response with security headers
 */
export function jsonResponse(
  data: unknown,
  options: { status?: number; sentryEnabled?: boolean } = {}
): Response {
  const { status = 200, sentryEnabled = false } = options;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...securityHeaders(sentryEnabled)
    }
  });
}

/**
 * Create error JSON response
 */
export function errorResponse(error: string, status: number, sentryEnabled = false): Response {
  return jsonResponse({ error }, { status, sentryEnabled });
}

/**
 * Create HTML response with security headers
 */
export function htmlResponse(
  html: string,
  options: { status?: number; sentryEnabled?: boolean } = {}
): Response {
  const { status = 200, sentryEnabled = false } = options;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...securityHeaders(sentryEnabled)
    }
  });
}

// === Result-based Response Helpers ===

/**
 * Standard API error response body
 */
export interface ApiErrorResponse {
  readonly error: string;
  readonly code: string;
}

/**
 * Convert Result to HTTP Response.
 * - Ok → jsonResponse with success data
 * - Err → error response with mapped HTTP status code
 */
export function resultResponse<T>(
  result: Result<T, AnyDomainError>,
  options: { sentryEnabled?: boolean } = {}
): Response {
  const { sentryEnabled = false } = options;

  if (isErr(result)) {
    const status = toHttpStatus(result.error);
    return jsonResponse(
      { error: result.error.message, code: result.error.code },
      { status, sentryEnabled }
    );
  }

  return jsonResponse(result.value, { sentryEnabled });
}

/**
 * Create domain error response from error object
 */
export function domainErrorResponse(error: AnyDomainError, sentryEnabled = false): Response {
  const status = toHttpStatus(error);
  return jsonResponse({ error: error.message, code: error.code }, { status, sentryEnabled });
}
