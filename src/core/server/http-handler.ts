/**
 * Native Terminal HTTP Request Handler
 *
 * Main HTTP request dispatcher. Routes requests to specific handlers:
 * - Static files (JS, CSS, PWA assets)
 * - HTML pages (portal, terminal, share)
 * - API endpoints
 */

import type { Config } from '@/core/config/types.js';
import type { NativeSessionManager } from './session-manager.js';
import { handleStaticRoutes } from './http/routes/static-routes.js';
import { handlePageRoutes } from './http/routes/page-routes.js';
import { handleApiRequest } from './http/routes/api/index.js';
import { securityHeaders } from './http/utils.js';

// Re-export for backward compatibility
export { getExecutorManager } from './http/routes/api/index.js';

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
  const sentryEnabled = config.sentry?.enabled ?? false;

  // API routes
  if (pathname.startsWith(`${basePath}/api/`)) {
    return handleApiRequest(req, config, sessionManager, basePath);
  }

  // Static file routes (JS, CSS, PWA)
  const staticResponse = handleStaticRoutes(req, pathname, {
    basePath,
    sentryEnabled
  });
  if (staticResponse) {
    return staticResponse;
  }

  // Page routes (portal, terminal, share)
  const pageResponse = await handlePageRoutes(req, pathname, {
    basePath,
    config,
    sessionManager
  });
  if (pageResponse) {
    return pageResponse;
  }

  // Not found
  return new Response('Not Found', {
    status: 404,
    headers: { ...securityHeaders(sentryEnabled), 'Content-Type': 'text/plain' }
  });
}
