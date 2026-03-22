/**
 * API Route Types (DEPRECATED)
 *
 * @deprecated Use the unified route types from '@/core/server/http/route-types.js' instead.
 *
 * Migration guide:
 * - Replace `ApiContext` with `RouteContext` from route-types.ts
 * - Replace `ApiRouteHandler` with `RouteHandler` from route-types.ts
 * - Define routes as `RouteDef[]` arrays instead of if-chain handlers
 * - Return `Result<T, DomainError>` instead of `Response | null`
 *
 * See docs/route-architecture.md for the new architecture.
 */

import type { Config } from '@/core/config/types.js';
import type { NativeSessionManager } from '@/core/server/session-manager.js';

/**
 * Context passed to all API route handlers
 *
 * @deprecated Use `RouteContext` from '@/core/server/http/route-types.js' instead.
 *
 * Migration:
 * ```typescript
 * // Before (deprecated)
 * import { ApiContext } from './types.js';
 *
 * // After
 * import { RouteContext } from '@/core/server/http/route-types.js';
 * ```
 */
export interface ApiContext {
  req: Request;
  config: Config;
  sessionManager: NativeSessionManager;
  basePath: string;
  apiPath: string;
  method: string;
  sentryEnabled: boolean;
}

/**
 * API route handler type
 * Returns Response if handled, null if not matched
 *
 * @deprecated Use `RouteHandler` from '@/core/server/http/route-types.js' instead.
 *
 * Migration:
 * ```typescript
 * // Before (deprecated)
 * const handler: ApiRouteHandler = async (ctx) => {
 *   if (ctx.apiPath !== '/api/items') return null;
 *   return new Response(JSON.stringify({ items: [] }));
 * };
 *
 * // After
 * const route: RouteDef = {
 *   method: 'GET',
 *   path: '/api/items',
 *   handler: async (ctx) => ok({ items: [] })
 * };
 * ```
 */
export type ApiRouteHandler = (ctx: ApiContext) => Promise<Response | null> | Response | null;
