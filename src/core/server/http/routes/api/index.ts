/**
 * API Routes Index
 *
 * Dispatches API requests to specific route handlers.
 */

import type { Config } from '@/core/config/types.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';
import { handleClaudeQuotesApi } from '@/features/ai/server/quotes/api-handler.js';
import { errorResponse, securityHeaders } from '../../utils.js';
import type { ApiContext } from './types.js';
import { handleSessionsRoutes } from './sessions-routes.js';
import { handleBlocksRoutes } from './blocks-routes.js';
import { handleNotificationsRoutes } from './notifications-routes.js';
import { handleSharesRoutes } from './shares-routes.js';
import { handleFilesRoutes } from './files-routes.js';
import { handlePreviewRoutes } from './preview-routes.js';
import { handleAiRoutes } from './ai-routes.js';
import { handleAuthRoutes } from './auth-routes.js';

// Re-export getExecutorManager for external use
export { getExecutorManager } from './blocks-routes.js';

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
  const apiPath = pathname.slice(`${basePath}/api`.length);
  const sentryEnabled = config.sentry?.enabled ?? false;

  const ctx: ApiContext = {
    req,
    config,
    sessionManager,
    basePath,
    apiPath,
    method,
    sentryEnabled
  };

  // Try each route handler in order
  const handlers = [
    handleSessionsRoutes,
    handleBlocksRoutes,
    handleNotificationsRoutes,
    handleSharesRoutes,
    handleFilesRoutes,
    handlePreviewRoutes,
    handleAiRoutes,
    handleAuthRoutes
  ];

  for (const handler of handlers) {
    const response = await handler(ctx);
    if (response) {
      return response;
    }
  }

  // Claude Quotes API (external handler)
  const headers = {
    'Content-Type': 'application/json',
    ...securityHeaders(sentryEnabled)
  };
  const claudeQuotesResponse = await handleClaudeQuotesApi(
    req,
    apiPath,
    method,
    headers,
    sessionManager
  );
  if (claudeQuotesResponse) {
    return claudeQuotesResponse;
  }

  // Not found
  return errorResponse('API endpoint not found', 404, sentryEnabled);
}
