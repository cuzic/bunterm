/**
 * Static File Routes (Elysia)
 *
 * Serves static assets (JS bundles, CSS, PWA files) with ETag caching.
 * Replaces the old static-routes.ts with Elysia plugin pattern.
 */

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Elysia } from 'elysia';
import { getIconPng, getIconSvg, getManifestJson, getServiceWorker } from '@/core/server/pwa.js';
import { coreContext } from './context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === ETag Helpers ===

function generateEtag(content: string | Uint8Array): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

interface CacheEntry {
  readonly content: string;
  readonly etag: string;
}

const fileCache = new Map<string, CacheEntry>();

async function loadDistFile(filename: string, fallbackMessage: string): Promise<CacheEntry> {
  const cached = fileCache.get(filename);
  if (cached) return cached;

  let content: string;
  try {
    // Go up from elysia/ to server/, then to dist/
    const distPath = join(__dirname, '../../../../dist', filename);
    content = await Bun.file(distPath).text();
  } catch {
    content = `// ${fallbackMessage}\nconsole.warn("[${filename}] Not found");`;
  }

  const entry: CacheEntry = { content, etag: generateEtag(content) };
  fileCache.set(filename, entry);
  return entry;
}

// === Timeline files (loaded from agent-timeline/client/) ===

async function loadTimelineFile(filename: string): Promise<CacheEntry> {
  const cached = fileCache.get(`timeline:${filename}`);
  if (cached) return cached;

  const filePath = join(__dirname, '../../../features/agent-timeline/client', filename);
  const content = await Bun.file(filePath).text();
  const entry: CacheEntry = { content, etag: generateEtag(content) };
  fileCache.set(`timeline:${filename}`, entry);
  return entry;
}

// === Shared response helpers ===

function etagResponse(
  request: Request,
  content: string | Uint8Array,
  etag: string,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): Response {
  const ifNoneMatch = request.headers.get('if-none-match');
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
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ...extraHeaders
    }
  });
}

// === Static file definitions ===

interface DistFileDef {
  readonly path: string;
  readonly filename: string;
  readonly contentType: string;
  readonly fallback: string;
}

const distFiles: readonly DistFileDef[] = [
  {
    path: '/terminal-ui.js',
    filename: 'terminal-ui.js',
    contentType: 'application/javascript',
    fallback: 'Run: bun run build:terminal-ui'
  },
  {
    path: '/xterm-bundle.js',
    filename: 'xterm-bundle.js',
    contentType: 'application/javascript',
    fallback: 'Run: bun run build:xterm'
  },
  {
    path: '/terminal-client.js',
    filename: 'terminal-client.js',
    contentType: 'application/javascript',
    fallback: 'Run: bun run build:terminal-client'
  },
  {
    path: '/ai-chat.js',
    filename: 'ai-chat.js',
    contentType: 'application/javascript',
    fallback: 'Run: bun run build:ai-chat'
  },
  {
    path: '/xterm.css',
    filename: 'xterm.css',
    contentType: 'text/css',
    fallback: 'xterm.css not found'
  }
];

// === Plugin ===

export const staticFilesPlugin = new Elysia()
  .use(coreContext)
  // PWA manifest (dynamic — depends on basePath from config)
  .get('/manifest.json', ({ config }) => {
    const json = getManifestJson(config.base_path);
    return new Response(json, {
      headers: { 'Content-Type': 'application/manifest+json' }
    });
  })

  // Service worker
  .get('/sw.js', ({ request }) => {
    const sw = getServiceWorker();
    const etag = generateEtag(sw);
    return etagResponse(request, sw, etag, 'application/javascript', {
      'Service-Worker-Allowed': '/'
    });
  })

  // SVG icon (long cache — content is static)
  .get('/icon.svg', () => {
    return new Response(getIconSvg(), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  })

  // PNG icons (long cache — content is static)
  .get('/icon-192.png', () => {
    const png = getIconPng(192);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  })
  .get('/icon-512.png', () => {
    const png = getIconPng(512);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  })

  // Agent timeline static files
  .get('/agents/timeline.js', async ({ request }) => {
    const entry = await loadTimelineFile('timeline.js');
    return etagResponse(request, entry.content, entry.etag, 'application/javascript');
  })
  .get('/agents/timeline.css', async ({ request }) => {
    const entry = await loadTimelineFile('timeline.css');
    return etagResponse(request, entry.content, entry.etag, 'text/css');
  });

// Register dist file routes dynamically
for (const def of distFiles) {
  (staticFilesPlugin as unknown as Elysia).get(def.path, async ({ request }) => {
    const entry = await loadDistFile(def.filename, def.fallback);
    return etagResponse(request, entry.content, entry.etag, def.contentType);
  });
}
