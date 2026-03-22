/**
 * API Routes Index
 *
 * Dispatches API requests using RouteRegistry for table-driven routing.
 */

import type { Config } from '@/core/config/types.js';
import { methodNotAllowed, notFound } from '@/core/errors.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import { errorEnvelopeResponse, executeRoute, generateRequestId } from '../../route-executor.js';
import { RouteRegistry } from '../../route-registry.js';
import type { RouteContext, RouteDeps } from '../../route-types.js';

import { aiRoutes } from './ai-routes.js';
// Import all route definitions
import { authRoutes } from './auth-routes.js';
import { blocksRoutes, getExecutorManager, handleBlockStream } from './blocks-routes.js';
import { claudeQuotesRoutes } from './claude-quotes-routes.js';
import { filesRoutes, handleFileDownload } from './files-routes.js';
import { notificationsRoutes } from './notifications-routes.js';
import { handleFilePreview, previewRoutes } from './preview-routes.js';
import { sessionsRoutes } from './sessions-routes.js';
import { sharesRoutes } from './shares-routes.js';

// Re-export getExecutorManager for external use
export { getExecutorManager };

// === Route Registry Setup ===

const apiRegistry = new RouteRegistry();

// Register all routes
apiRegistry.registerAll(authRoutes);
apiRegistry.registerAll(notificationsRoutes);
apiRegistry.registerAll(sharesRoutes);
apiRegistry.registerAll(filesRoutes);
apiRegistry.registerAll(previewRoutes);
apiRegistry.registerAll(aiRoutes);
apiRegistry.registerAll(sessionsRoutes);
apiRegistry.registerAll(blocksRoutes);
apiRegistry.registerAll(claudeQuotesRoutes);

// === Special Handlers (non-JSON responses) ===

/**
 * Handle special routes that return non-JSON responses.
 * These need to be checked before the standard route matching.
 */
async function handleSpecialRoutes(
  req: Request,
  apiPath: string,
  ctx: RouteContext
): Promise<Response | null> {
  // File download (binary)
  if (apiPath === '/files/download' && req.method === 'GET') {
    return handleFileDownload(ctx);
  }

  // File preview (HTML)
  if (apiPath === '/files/preview' && req.method === 'GET') {
    return handleFilePreview(ctx);
  }

  // Block stream (SSE)
  if (apiPath.match(/^\/blocks\/[^/]+\/stream$/) && req.method === 'GET') {
    return handleBlockStream(ctx);
  }

  return null;
}

// === Main Handler ===

/**
 * Handle all API requests
 */
export async function handleApiRequest(
  req: Request,
  config: Config,
  sessionManager: NativeSessionManager,
  basePath: string
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;
  const sentryEnabled = config.sentry?.enabled ?? false;

  // Extract API path (remove basePath + /api prefix)
  const apiPath = pathname.slice(`${basePath}/api`.length);

  // Create dependencies for route execution
  const deps: RouteDeps = {
    sessionManager,
    config,
    basePath,
    sentryEnabled
  };

  // Create minimal context for special handlers
  const requestId = generateRequestId();
  const minimalCtx: RouteContext = {
    body: undefined,
    params: undefined,
    pathParams: {},
    sessionManager,
    config,
    requestId,
    req,
    sentryEnabled,
    basePath
  };

  // Check special routes first (non-JSON responses)
  const specialResponse = await handleSpecialRoutes(req, apiPath, minimalCtx);
  if (specialResponse) {
    return specialResponse;
  }

  // Match route in registry
  // Note: apiPath starts with '/', we need to match against '/api' + apiPath
  const fullApiPath = `/api${apiPath}`;
  const match = apiRegistry.match(method, fullApiPath);

  if (match) {
    return executeRoute(match.route, req, match.pathParams, deps);
  }

  // Check if path exists but method not allowed
  const allowedMethods = apiRegistry.hasPath(fullApiPath);
  if (allowedMethods.length > 0) {
    const error = methodNotAllowed(method, allowedMethods);
    return errorEnvelopeResponse(error, requestId, sentryEnabled);
  }

  // Not found
  const error = notFound(fullApiPath);
  return errorEnvelopeResponse(error, requestId, sentryEnabled);
}
