/**
 * API request handler
 *
 * Routes incoming API requests to appropriate handlers.
 * Each route category is handled by a dedicated module in ./api/
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeBasePath } from '@/config/config.js';
import type { Config } from '@/config/types.js';
import {
  type RouteContext,
  handleClipboardRoutes,
  handleDirectoryRoutes,
  handleFileRoutes,
  handleHealthRoutes,
  handleNotificationRoutes,
  handlePreviewStaticRoutes,
  handleSessionRoutes,
  handleShareRoutes
} from './api/index.js';
import { sendJson } from './http-utils.js';

// Re-export sendJson for backward compatibility
export { sendJson } from './http-utils.js';

/**
 * Main API request handler
 * Delegates to specialized route handlers based on the request path
 */
export function handleApiRequest(config: Config, req: IncomingMessage, res: ServerResponse): void {
  const basePath = normalizeBasePath(config.base_path);
  const url = req.url ?? '/';
  const path = url.slice(basePath.length);
  const method = req.method ?? 'GET';

  const ctx: RouteContext = { config, req, res, path, method };

  // Try each route handler in order
  // First match wins, so order matters for overlapping paths

  // Health check first (lightweight, used for monitoring)
  if (handleHealthRoutes(ctx)) {
    return;
  }
  if (handleSessionRoutes(ctx)) {
    return;
  }
  if (handleShareRoutes(ctx)) {
    return;
  }
  if (handleNotificationRoutes(ctx)) {
    return;
  }
  if (handleFileRoutes(ctx)) {
    return;
  }
  if (handlePreviewStaticRoutes(ctx)) {
    return;
  }
  if (handleClipboardRoutes(ctx)) {
    return;
  }
  if (handleDirectoryRoutes(ctx)) {
    return;
  }

  // Not found
  sendJson(res, 404, { error: 'API endpoint not found' });
}
