/**
 * Shared types for API route handlers
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from '@/config/types.js';

/**
 * Context passed to route handlers
 */
export interface RouteContext {
  config: Config;
  req: IncomingMessage;
  res: ServerResponse;
  path: string;
  method: string;
}

/**
 * Route handler function
 * Returns true if the route was handled, false otherwise
 */
export type RouteHandler = (ctx: RouteContext) => boolean;
