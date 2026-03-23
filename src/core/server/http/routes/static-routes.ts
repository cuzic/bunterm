/**
 * Static File Routes
 *
 * Handles serving of static assets: JS bundles, CSS, PWA files.
 */

import { generateEtag, securityHeaders, serveStaticFile } from '@/core/server/http/utils.js';
import { getIconPng, getIconSvg, getManifestJson, getServiceWorker } from '@/core/server/pwa.js';
import { serveTimelineCss, serveTimelineJs } from '@/features/agent-timeline/client/index.js';

export interface StaticRoutesConfig {
  basePath: string;
  sentryEnabled: boolean;
}

/**
 * Handle static file routes
 * Returns Response if handled, null if not a static route
 */
export function handleStaticRoutes(
  req: Request,
  pathname: string,
  config: StaticRoutesConfig
): Response | null {
  const { basePath, sentryEnabled } = config;
  const headers = securityHeaders(sentryEnabled);

  // PWA manifest
  if (pathname === `${basePath}/manifest.json`) {
    const json = getManifestJson(basePath);
    return new Response(json, {
      headers: { ...headers, 'Content-Type': 'application/manifest+json' }
    });
  }

  // Service worker
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

  // SVG icon
  if (pathname === `${basePath}/icon.svg`) {
    return new Response(getIconSvg(), {
      headers: {
        ...headers,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  }

  // PNG icons
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

  // JavaScript bundles
  if (pathname === `${basePath}/terminal-ui.js`) {
    return serveStaticFile(
      req,
      'terminal-ui.js',
      'application/javascript',
      'Run: bun run build:terminal-ui'
    );
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

  if (pathname === `${basePath}/ai-chat.js`) {
    return serveStaticFile(
      req,
      'ai-chat.js',
      'application/javascript',
      'Run: bun run build:ai-chat'
    );
  }

  // CSS
  if (pathname === `${basePath}/xterm.css`) {
    return serveStaticFile(req, 'xterm.css', 'text/css', 'xterm.css not found');
  }

  // Agent timeline static files
  if (pathname === `${basePath}/agents/timeline.js`) {
    return serveTimelineJs(req);
  }

  if (pathname === `${basePath}/agents/timeline.css`) {
    return serveTimelineCss(req);
  }

  return null;
}
