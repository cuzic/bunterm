/**
 * StaticFileServer - Cached static file serving with ETag support
 *
 * Provides:
 * - Lazy loading of static files from dist directory
 * - ETag-based conditional request handling (304 Not Modified)
 * - In-memory caching for performance
 */

import { createHash } from 'node:crypto';
// biome-ignore lint: startup-time sync read, files cached in memory
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('static-file');

// Base directory for dist files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = join(__dirname, '../../dist');

/**
 * Generate ETag from content using MD5 hash
 */
export function generateEtag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

/**
 * Static file server with ETag caching
 */
export class StaticFileServer {
  private cache: string | null = null;
  private etag: string | null = null;

  constructor(
    private readonly filename: string,
    private readonly contentType: string,
    private readonly fallbackContent?: string
  ) {}

  /**
   * Load file content (cached)
   */
  load(): { content: string; etag: string } {
    if (this.cache !== null && this.etag !== null) {
      return { content: this.cache, etag: this.etag };
    }

    try {
      const filePath = join(DIST_DIR, this.filename);
      // biome-ignore lint: sync read for file caching
      this.cache = readFileSync(filePath, 'utf-8');
      log.debug(`Loaded ${this.filename} from dist`);
    } catch {
      log.warn(`${this.filename} not found in dist, returning placeholder`);
      this.cache = this.fallbackContent ?? `// ${this.filename} not found`;
    }

    this.etag = generateEtag(this.cache);
    return { content: this.cache, etag: this.etag };
  }

  /**
   * Serve file with ETag conditional request support
   */
  serve(req: IncomingMessage, res: ServerResponse): void {
    const { content, etag } = this.load();

    // Check If-None-Match header for conditional request
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=0, must-revalidate'
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': this.contentType,
      'Content-Length': Buffer.byteLength(content),
      ETag: etag,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    res.end(content);
  }

  /**
   * Reset cache (for testing or hot-reload)
   */
  reset(): void {
    this.cache = null;
    this.etag = null;
  }
}

/**
 * Create a StaticFileServer for a JavaScript file
 */
export function createJsFileServer(filename: string, buildCommand?: string): StaticFileServer {
  const fallback = buildCommand
    ? `// ${filename} not built - run: ${buildCommand}\nconsole.warn("[${filename}] Bundle not found");`
    : `// ${filename} not found`;
  return new StaticFileServer(filename, 'application/javascript', fallback);
}

/**
 * Create a StaticFileServer for a CSS file
 */
export function createCssFileServer(filename: string, buildCommand?: string): StaticFileServer {
  const fallback = buildCommand
    ? `/* ${filename} not found - run: ${buildCommand} */`
    : `/* ${filename} not found */`;
  return new StaticFileServer(filename, 'text/css', fallback);
}

// Pre-configured static file servers
export const staticFiles = {
  terminalUi: createJsFileServer('terminal-ui.js', 'bun run build:terminal-ui'),
  xtermBundle: createJsFileServer('xterm-bundle.js', 'bun run build:xterm'),
  terminalClient: createJsFileServer('terminal-client.js', 'bun run build:terminal-client'),
  xtermCss: createCssFileServer('xterm.css', 'bun run build:xterm')
};

/**
 * Reset all static file caches (for testing)
 */
export function resetAllStaticCaches(): void {
  for (const server of Object.values(staticFiles)) {
    server.reset();
  }
}
