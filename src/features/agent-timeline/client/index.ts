/**
 * Agent Timeline Static File Server
 *
 * Serves timeline.css and timeline.js with ETag caching.
 * Files are read from the same directory at startup.
 */

import { createHash } from 'node:crypto';
// biome-ignore lint: startup-time sync read, files cached in memory
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CacheEntry {
  readonly content: string;
  readonly etag: string;
}

function loadAndCache(filename: string): CacheEntry {
  const filePath = join(__dirname, filename);
  // biome-ignore lint: sync read for file caching
  const content = readFileSync(filePath, 'utf-8');
  const etag = `"${createHash('md5').update(content).digest('hex')}"`;
  return { content, etag };
}

// Load files once at import time
const timelineCss = loadAndCache('timeline.css');
const timelineJs = loadAndCache('timeline.js');

function serveWithEtag(req: Request, entry: CacheEntry, contentType: string): Response {
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch === entry.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: entry.etag, 'Cache-Control': 'public, max-age=0, must-revalidate' }
    });
  }

  return new Response(entry.content, {
    headers: {
      'Content-Type': contentType,
      ETag: entry.etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
}

/**
 * Serve timeline.css with ETag support
 */
export function serveTimelineCss(req: Request): Response {
  return serveWithEtag(req, timelineCss, 'text/css');
}

/**
 * Serve timeline.js with ETag support
 */
export function serveTimelineJs(req: Request): Response {
  return serveWithEtag(req, timelineJs, 'application/javascript');
}
