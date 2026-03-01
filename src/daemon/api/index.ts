/**
 * API routes index
 *
 * Re-exports all route handlers for use in the main API handler.
 */

export { handleClipboardRoutes } from './clipboard-routes.js';
export { handleDirectoryRoutes } from './directory-routes.js';
export { handleFileRoutes } from './file-routes.js';
export { handleHealthRoutes } from './health.js';
export { handleNotificationRoutes } from './notification-routes.js';
export { handlePreviewStaticRoutes } from './preview-static.js';
export { handleSessionRoutes } from './session-routes.js';
export { handleShareRoutes } from './share-routes.js';
export type { RouteContext, RouteHandler } from './types.js';
